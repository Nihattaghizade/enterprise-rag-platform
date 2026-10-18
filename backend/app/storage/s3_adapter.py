import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.config import get_settings
from app.storage.minio_client import ensure_bucket, get_s3_client


def sanitize_filename(filename: str) -> str:
    """Sanitize uploaded filename for safe object key usage."""
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", filename.strip())
    return cleaned or "document.bin"


def build_original_object_key(
    tenant_id: uuid.UUID | str,
    document_id: uuid.UUID | str,
    version: int,
    filename: str,
) -> str:
    """Section 5.4D & 5.5: tenants/{tenant_id}/documents/{document_id}/versions/{version}/original/{filename}"""
    safe_name = sanitize_filename(filename)
    return f"tenants/{tenant_id}/documents/{document_id}/versions/{version}/original/{safe_name}"


def build_parent_context_object_key(
    tenant_id: uuid.UUID | str,
    document_id: uuid.UUID | str,
    version: int,
    parent_id: uuid.UUID | str,
) -> str:
    """Section 5.4D & 5.5: tenants/{tenant_id}/documents/{document_id}/versions/{version}/parents/{parent_id}.txt"""
    return f"tenants/{tenant_id}/documents/{document_id}/versions/{version}/parents/{parent_id}.txt"


async def upload_original(
    *,
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    version: int,
    filename: str,
    content: bytes,
    mime_type: str,
    uploaded_by: Optional[uuid.UUID] = None,
) -> str:
    """Upload original document file to MinIO with required metadata tags and return storage_key."""
    settings = get_settings()
    await ensure_bucket()

    storage_key = build_original_object_key(
        tenant_id=tenant_id,
        document_id=document_id,
        version=version,
        filename=filename,
    )
    content_sha256 = hashlib.sha256(content).hexdigest()
    safe_filename = sanitize_filename(filename)

    # Required object metadata per ARCHITECTURE.md Section 5.4D
    metadata: dict[str, str] = {
        "tenant_id": str(tenant_id),
        "document_id": str(document_id),
        "document_version": str(version),
        "uploaded_by": str(uploaded_by) if uploaded_by is not None else "system",
        "content_sha256": content_sha256,
        "source_filename": safe_filename,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    async with get_s3_client() as client:
        await client.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=storage_key,
            Body=content,
            ContentType=mime_type,
            Metadata=metadata,
        )

    return storage_key


async def upload_parent_context_text(
    *,
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    version: int,
    parent_id: uuid.UUID,
    text: str,
) -> str:
    """Optional external storage for large parent-context text per Section 5.4D."""
    settings = get_settings()
    await ensure_bucket()

    storage_key = build_parent_context_object_key(
        tenant_id=tenant_id,
        document_id=document_id,
        version=version,
        parent_id=parent_id,
    )
    encoded = text.encode("utf-8")
    content_sha256 = hashlib.sha256(encoded).hexdigest()

    metadata: dict[str, str] = {
        "tenant_id": str(tenant_id),
        "document_id": str(document_id),
        "document_version": str(version),
        "content_sha256": content_sha256,
        "source_filename": f"{parent_id}.txt",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    async with get_s3_client() as client:
        await client.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=storage_key,
            Body=encoded,
            ContentType="text/plain; charset=utf-8",
            Metadata=metadata,
        )

    return storage_key


async def download_object(storage_key: str) -> bytes:
    """Download an object by storage_key from the rag-documents bucket."""
    settings = get_settings()
    async with get_s3_client() as client:
        response = await client.get_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=storage_key,
        )
        async with response["Body"] as stream:
            return await stream.read()


async def delete_object(storage_key: str) -> None:
    """Delete an object by storage_key from the rag-documents bucket."""
    settings = get_settings()
    async with get_s3_client() as client:
        await client.delete_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=storage_key,
        )


async def create_presigned_download_url(
    storage_key: str,
    expires_in: Optional[int] = None,
) -> str:
    """Generate a short-lived presigned download URL for authorized client access."""
    settings = get_settings()
    ttl = expires_in or settings.MINIO_PRESIGNED_URL_EXPIRE_SECONDS
    async with get_s3_client() as client:
        url: str = await client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": settings.MINIO_BUCKET_NAME,
                "Key": storage_key,
            },
            ExpiresIn=ttl,
        )
        return url