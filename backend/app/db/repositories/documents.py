import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Document, ParentContext


class DocumentRepository:
    """Tenant-scoped persistence queries for Document and ParentContext."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        tenant_id: uuid.UUID,
        title: str,
        file_name: str,
        mime_type: str,
        storage_key: str,
        uploader_id: uuid.UUID,
        status: str = "processing",
        version: int = 1,
        doc_type: Optional[str] = None,
        author: Optional[str] = None,
        department: Optional[str] = None,
        tags: Optional[list[str]] = None,
        language: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        document_id: Optional[uuid.UUID] = None,
    ) -> Document:
        document = Document(
            id=document_id or uuid.uuid4(),
            tenant_id=tenant_id,
            title=title,
            file_name=file_name,
            mime_type=mime_type,
            storage_key=storage_key,
            uploader_id=uploader_id,
            status=status,
            version=version,
            doc_type=doc_type,
            author=author,
            department=department,
            tags=tags or [],
            language=language,
            metadata_=metadata or {},
        )
        self.session.add(document)
        await self.session.flush()
        return document

    async def get_by_id(
        self,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID,
    ) -> Optional[Document]:
        """Fetch document strictly scoped by tenant_id."""
        stmt = select(Document).where(
            Document.tenant_id == tenant_id,
            Document.id == document_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_for_processing(
        self,
        document_id: uuid.UUID,
        tenant_id: Optional[uuid.UUID] = None,
    ) -> Optional[Document]:
        """Fetch document for background ingestion worker."""
        stmt = select(Document).where(Document.id == document_id)
        if tenant_id is not None:
            stmt = stmt.where(Document.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_tenant(
        self,
        tenant_id: uuid.UUID,
        status: Optional[str] = None,
        include_deleted: bool = False,
    ) -> Sequence[Document]:
        stmt = select(Document).where(Document.tenant_id == tenant_id)
        if status is not None:
            stmt = stmt.where(Document.status == status)
        elif not include_deleted:
            stmt = stmt.where(Document.status != "deleted")
        stmt = stmt.order_by(Document.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update_status(
        self,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID,
        status: str,
        page_count: Optional[int] = None,
        char_count: Optional[int] = None,
        language: Optional[str] = None,
    ) -> Optional[Document]:
        doc = await self.get_by_id(tenant_id=tenant_id, document_id=document_id)
        if doc is None:
            return None
        now = datetime.now(timezone.utc)
        doc.status = status
        doc.updated_at = now
        if page_count is not None:
            doc.page_count = page_count
        if char_count is not None:
            doc.char_count = char_count
        if language is not None:
            doc.language = language
        if status == "deprecated":
            doc.deprecated_at = now
        elif status == "deleted":
            doc.deleted_at = now
        await self.session.flush()
        await self.session.refresh(doc)
        return doc

    async def mark_ready(
        self,
        document_id: uuid.UUID,
        tenant_id: Optional[uuid.UUID] = None,
        page_count: Optional[int] = None,
        char_count: Optional[int] = None,
    ) -> Optional[Document]:
        doc = await self.get_for_processing(document_id=document_id, tenant_id=tenant_id)
        if doc is None:
            return None
        doc.status = "ready"
        doc.updated_at = datetime.now(timezone.utc)
        if page_count is not None:
            doc.page_count = page_count
        if char_count is not None:
            doc.char_count = char_count
        await self.session.flush()
        await self.session.refresh(doc)
        return doc

    async def mark_failed(
        self,
        document_id: uuid.UUID,
        tenant_id: Optional[uuid.UUID] = None,
    ) -> Optional[Document]:
        doc = await self.get_for_processing(document_id=document_id, tenant_id=tenant_id)
        if doc is None:
            return None
        doc.status = "failed"
        doc.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        await self.session.refresh(doc)
        return doc

    async def create_parent_contexts(
        self,
        document: Document,
        parents: Sequence[dict[str, Any]],
    ) -> list[uuid.UUID]:
        """Persist ParentContext rows for a document and return their UUIDs."""
        created_ids: list[uuid.UUID] = []
        for item in parents:
            parent_id = item.get("id") or uuid.uuid4()
            row = ParentContext(
                id=parent_id,
                document_id=document.id,
                section_number=str(item["section_number"]),
                strategy=str(item["strategy"]),
                text=item.get("text"),
                storage_key=item.get("storage_key"),
                token_count=int(item["token_count"]),
                section_title=item.get("section_title"),
                start_offset=item.get("start_offset"),
                end_offset=item.get("end_offset"),
                metadata_=item.get("metadata") or {},
            )
            self.session.add(row)
            created_ids.append(parent_id)
        await self.session.flush()
        return created_ids

    async def get_parent_contexts_by_ids(
        self,
        tenant_id: uuid.UUID,
        parent_ids: Sequence[uuid.UUID],
    ) -> Sequence[ParentContext]:
        """Fetch ParentContext rows joined with Document to enforce tenant_id isolation."""
        if not parent_ids:
            return []
        stmt = (
            select(ParentContext)
            .join(Document, ParentContext.document_id == Document.id)
            .where(
                Document.tenant_id == tenant_id,
                Document.status == "ready",
                ParentContext.id.in_(parent_ids),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def delete_parent_contexts(
        self,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID,
    ) -> int:
        doc = await self.get_by_id(tenant_id=tenant_id, document_id=document_id)
        if doc is None:
            return 0
        stmt = delete(ParentContext).where(ParentContext.document_id == document_id)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount or 0