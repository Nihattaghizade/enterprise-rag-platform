import uuid
from typing import Any, Optional, Sequence

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import NotFoundError, ValidationError
from app.core.rate_limit import check_rate_limit, get_redis_client
from app.db.models import Document, Membership
from app.db.repositories.documents import DocumentRepository
from app.db.repositories.tenants import TenantRepository
from app.ingestion.index import delete_document_points
from app.ingestion.parser import SUPPORTED_MIME_TYPES
from app.services.audit_service import write_audit_event
from app.services.usage_service import check_quota, record_model_usage
from app.storage.s3_adapter import (
    create_presigned_download_url,
    delete_object,
    upload_original,
)
from app.tasks.queue import enqueue_ingest, enqueue_reindex

_EXTENSION_TO_MIME: dict[str, str] = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def resolve_supported_mime_type(filename: str, provided_mime: Optional[str]) -> str:
    cleaned_mime = (provided_mime or "").split(";")[0].strip().lower()
    if cleaned_mime in SUPPORTED_MIME_TYPES:
        return cleaned_mime
    lower_name = (filename or "").lower()
    for ext, mapped_mime in _EXTENSION_TO_MIME.items():
        if lower_name.endswith(ext):
            return mapped_mime
    raise ValidationError(
        f"Unsupported file format for '{filename}'. Supported: TXT, MD, DOCX, PPTX, PDF, HTML.",
        code="unsupported_format",
    )


async def invalidate_tenant_query_cache(
    tenant_id: uuid.UUID,
    redis_client: Optional[Redis] = None,
) -> int:
    """Section 5.4C & 13.3: Invalidate rag:{env}:cache:query:{tenant_id}:* entries."""
    settings = get_settings()
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        pattern = f"rag:{settings.ENVIRONMENT}:cache:query:{tenant_id}:*"
        keys = [k async for k in client.scan_iter(match=pattern)]
        if keys:
            return int(await client.delete(*keys))
        return 0
    finally:
        if owns_client:
            await client.aclose()


async def create_upload(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    uploader_id: uuid.UUID,
    filename: str,
    content: bytes,
    mime_type: Optional[str] = None,
    title: Optional[str] = None,
    doc_type: Optional[str] = None,
    author: Optional[str] = None,
    department: Optional[str] = None,
    tags: Optional[list[str]] = None,
    language: Optional[str] = None,
    redis_client: Optional[Redis] = None,
) -> tuple[Document, dict[str, Any]]:
    """Section 9 & 13.1: Upload original to MinIO, save Document(status=processing), enqueue ingest job."""
    if not content:
        raise ValidationError("Uploaded file is empty.", code="empty_file")

    resolved_mime = resolve_supported_mime_type(filename, mime_type)

    owns_redis = redis_client is None
    rclient = redis_client or get_redis_client()
    try:
        await check_rate_limit(rclient, tenant_id=tenant_id, scope="upload")
        await check_quota(session, tenant_id, redis_client=rclient)

        # Enforce trial sandbox upload limit (max 2 files)
        tenant_repo = TenantRepository(session)
        tenant = await tenant_repo.get_by_id(tenant_id)
        membership_stmt = select(Membership).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == uploader_id,
        )
        mem_res = await session.execute(membership_stmt)
        user_membership = mem_res.scalar_one_or_none()

        is_trial = bool(
            (tenant and tenant.settings and tenant.settings.get("is_sandbox"))
            or (user_membership and user_membership.role == "trial_viewer")
        )
        if is_trial:
            max_docs = int(tenant.settings.get("max_documents", 2)) if (tenant and tenant.settings and "max_documents" in tenant.settings) else 2
            doc_count_stmt = select(func.count(Document.id)).where(
                Document.tenant_id == tenant_id,
                Document.deleted_at.is_(None),
            )
            res = await session.execute(doc_count_stmt)
            current_count = res.scalar_one() or 0
            if current_count >= max_docs:
                raise ValidationError(
                    f"Trial limit reached: maximum of {max_docs} documents allowed for evaluation accounts.",
                    code="trial_document_limit_reached",
                )

        document_id = uuid.uuid4()
        storage_key = await upload_original(
            tenant_id=tenant_id,
            document_id=document_id,
            version=1,
            filename=filename,
            content=content,
            mime_type=resolved_mime,
            uploaded_by=uploader_id,
        )

        doc_repo = DocumentRepository(session)
        document = await doc_repo.create(
            document_id=document_id,
            tenant_id=tenant_id,
            title=(title or filename).strip(),
            file_name=filename,
            mime_type=resolved_mime,
            storage_key=storage_key,
            uploader_id=uploader_id,
            status="processing",
            version=1,
            doc_type=doc_type,
            author=author,
            department=department,
            tags=tags or [],
            language=language,
        )

        await write_audit_event(
            session,
            tenant_id=tenant_id,
            actor_user_id=uploader_id,
            action="document.uploaded",
            resource_type="document",
            resource_id=document.id,
            details={"file_name": filename, "mime_type": resolved_mime, "size_bytes": len(content)},
        )
        await session.commit()

        job_entry = await enqueue_ingest(
            document_id=document.id,
            tenant_id=tenant_id,
            redis_client=rclient,
        )
        await invalidate_tenant_query_cache(tenant_id, redis_client=rclient)
        return document, job_entry
    finally:
        if owns_redis:
            await rclient.aclose()


async def list_documents(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    status: Optional[str] = None,
) -> Sequence[Document]:
    """List tenant-scoped documents excluding deleted records."""
    doc_repo = DocumentRepository(session)
    return await doc_repo.list_by_tenant(tenant_id=tenant_id, status=status)


async def get_document(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    include_download_url: bool = False,
) -> tuple[Document, Optional[str]]:
    """Fetch a single tenant-scoped document and optional presigned download URL."""
    doc_repo = DocumentRepository(session)
    doc = await doc_repo.get_by_id(tenant_id=tenant_id, document_id=document_id)
    if doc is None or doc.status == "deleted":
        raise NotFoundError("Document not found.")

    download_url: Optional[str] = None
    if include_download_url:
        download_url = await create_presigned_download_url(doc.storage_key)
    return doc, download_url


async def request_reindex(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    redis_client: Optional[Redis] = None,
) -> dict[str, Any]:
    """Section 9: Authorize and enqueue a document reindex job."""
    doc_repo = DocumentRepository(session)
    doc = await doc_repo.get_by_id(tenant_id=tenant_id, document_id=document_id)
    if doc is None or doc.status == "deleted":
        raise NotFoundError("Document not found.")

    await doc_repo.update_status(tenant_id=tenant_id, document_id=document_id, status="processing")
    await write_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        action="document.reindex_requested",
        resource_type="document",
        resource_id=document_id,
        details={"current_version": doc.version},
    )
    await session.commit()

    job = await enqueue_reindex(
        document_id=document_id,
        tenant_id=tenant_id,
        redis_client=redis_client,
    )
    await invalidate_tenant_query_cache(tenant_id, redis_client=redis_client)
    return job


async def delete_document(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    redis_client: Optional[Redis] = None,
) -> Document:
    """Section 9 & 13.3: Delete Qdrant points (tenant_id + doc_id), delete MinIO object, mark deleted in Postgres, invalidate Redis cache, write audit log."""
    doc_repo = DocumentRepository(session)
    doc = await doc_repo.get_by_id(tenant_id=tenant_id, document_id=document_id)
    if doc is None or doc.status == "deleted":
        raise NotFoundError("Document not found.")

    await delete_document_points(tenant_id=tenant_id, document_id=document_id)

    try:
        await delete_object(doc.storage_key)
    except Exception:
        pass

    await doc_repo.delete_parent_contexts(tenant_id=tenant_id, document_id=document_id)
    updated_doc = await doc_repo.update_status(
        tenant_id=tenant_id,
        document_id=document_id,
        status="deleted",
    )
    assert updated_doc is not None

    await invalidate_tenant_query_cache(tenant_id, redis_client=redis_client)

    await record_model_usage(
        session,
        tenant_id=tenant_id,
        document_count_delta=-1,
    )
    await write_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        action="document.deleted",
        resource_type="document",
        resource_id=document_id,
        details={"file_name": doc.file_name, "version": doc.version},
    )
    await session.commit()
    return updated_doc
