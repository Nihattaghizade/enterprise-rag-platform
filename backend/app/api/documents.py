import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, require_roles
from app.db.session import get_db_session
from app.schemas.documents import (
    DocumentListResponse,
    DocumentReindexResponse,
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUploadAcceptedResponse,
)
from app.services import document_service

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


@router.post(
    "",
    response_model=DocumentUploadAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_document_endpoint(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    doc_type: Optional[str] = Form(default=None),
    author: Optional[str] = Form(default=None),
    department: Optional[str] = Form(default=None),
    tags: Optional[str] = Form(default=None),
    language: Optional[str] = Form(default=None),
    ctx: AuthContext = Depends(require_roles("admin", "editor", "trial_viewer")),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentUploadAcceptedResponse:
    """Section 5.2 & Guardrail #2: Accept file upload, save to MinIO, queue ingestion, and return 202 Accepted."""
    raw_bytes = await file.read()
    parsed_tags = [t.strip() for t in (tags or "").split(",") if t.strip()]

    doc, job = await document_service.create_upload(
        session,
        tenant_id=ctx.tenant_id,
        uploader_id=ctx.user_id,
        filename=file.filename or "document.txt",
        content=raw_bytes,
        mime_type=file.content_type,
        title=title,
        doc_type=doc_type,
        author=author,
        department=department,
        tags=parsed_tags,
        language=language,
    )
    return DocumentUploadAcceptedResponse(
        document=DocumentResponse.model_validate(doc),
        job_id=job["job_id"],
        status=doc.status,
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents_endpoint(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentListResponse:
    """List documents scoped strictly to the authenticated tenant."""
    docs = await document_service.list_documents(
        session,
        tenant_id=ctx.tenant_id,
        status=status_filter,
    )
    items = [DocumentResponse.model_validate(d) for d in docs]
    return DocumentListResponse(items=items, total=len(items))


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document_endpoint(
    document_id: uuid.UUID,
    include_download_url: bool = Query(default=False),
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentResponse:
    """Get document details and optional short-lived presigned download URL."""
    doc, download_url = await document_service.get_document(
        session,
        tenant_id=ctx.tenant_id,
        document_id=document_id,
        include_download_url=include_download_url,
    )
    resp = DocumentResponse.model_validate(doc)
    resp.download_url = download_url
    return resp


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status_endpoint(
    document_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentStatusResponse:
    """Get document ingestion lifecycle status."""
    doc, _ = await document_service.get_document(
        session,
        tenant_id=ctx.tenant_id,
        document_id=document_id,
        include_download_url=False,
    )
    return DocumentStatusResponse(
        id=doc.id,
        tenant_id=doc.tenant_id,
        status=doc.status,
        version=doc.version,
        page_count=doc.page_count,
        char_count=doc.char_count,
        updated_at=doc.updated_at,
    )


@router.post(
    "/{document_id}/reindex",
    response_model=DocumentReindexResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def reindex_document_endpoint(
    document_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin", "editor", "trial_viewer")),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentReindexResponse:
    """Queue a document reindex job."""
    job = await document_service.request_reindex(
        session,
        tenant_id=ctx.tenant_id,
        document_id=document_id,
        actor_user_id=ctx.user_id,
    )
    return DocumentReindexResponse(
        document_id=document_id,
        job_id=job["job_id"],
        status="processing",
    )


@router.delete("/{document_id}", response_model=DocumentResponse)
async def delete_document_endpoint(
    document_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin", "editor", "trial_viewer")),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentResponse:
    """Delete a document across Qdrant, MinIO, Redis cache, and PostgreSQL."""
    deleted_doc = await document_service.delete_document(
        session,
        tenant_id=ctx.tenant_id,
        document_id=document_id,
        actor_user_id=ctx.user_id,
    )
    return DocumentResponse.model_validate(deleted_doc)