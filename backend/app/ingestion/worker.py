import asyncio
import logging
import uuid
from datetime import date
from typing import Optional

from app.db.repositories.audit import AuditRepository
from app.db.repositories.documents import DocumentRepository
from app.db.session import create_engine, get_session_factory
from app.ingestion.chunking import build_chunk_plan
from app.ingestion.embed import embed_texts
from app.ingestion.index import delete_document_points, upsert_retrieval_chunks
from app.ingestion.normalize import normalize_text
from app.ingestion.parser import parse_file
from app.ingestion.sections import split_into_sections
from app.observability.logging import configure_logging
from app.observability.tracing import trace_ingestion
from app.storage.s3_adapter import download_object
from app.tasks.queue import (
    acquire_document_lock,
    dequeue_job,
    move_to_dead_letter,
    release_document_lock,
    update_job_status,
)

logger = logging.getLogger(__name__)


@trace_ingestion("process_ingest_job")
async def process_ingest_job(
    document_id: uuid.UUID,
    job_id: Optional[str] = None,
) -> None:
    """Section 6.3: Execute full asynchronous document ingestion flow."""
    create_engine()
    session_factory = get_session_factory()

    locked = await acquire_document_lock(document_id)
    if not locked:
        logger.warning("Document %s is already locked by another worker", document_id)
        return

    try:
        if job_id:
            await update_job_status(job_id, "running", progress=10)

        async with session_factory() as session:
            doc_repo = DocumentRepository(session)
            audit_repo = AuditRepository(session)

            document = await doc_repo.get_for_processing(document_id)
            if document is None:
                logger.error("Document %s not found for ingestion", document_id)
                return

            doc_id = document.id
            doc_tenant_id = document.tenant_id
            doc_uploader_id = document.uploader_id

            try:
                raw_file = await download_object(document.storage_key)
                parsed = parse_file(raw_file, document.mime_type, filename=document.file_name)
                normalized = normalize_text(parsed.text)
                sections = split_into_sections(normalized)
                plan = build_chunk_plan(sections)

                parent_dicts = [p.to_repository_dict() for p in plan.parents]
                parent_ids = await doc_repo.create_parent_contexts(document, parent_dicts)

                vectors = await embed_texts([chunk.text for chunk in plan.children])
                await upsert_retrieval_chunks(document, plan.children, parent_ids, vectors)

                await doc_repo.mark_ready(
                    document_id=document.id,
                    tenant_id=document.tenant_id,
                    page_count=parsed.page_count,
                    char_count=len(normalized),
                )

                total_embedded_tokens = sum(c.token_count for c in plan.children)
                await audit_repo.increment_usage_record(
                    tenant_id=document.tenant_id,
                    usage_date=date.today(),
                    embedding_tokens=total_embedded_tokens,
                    storage_bytes_delta=len(raw_file),
                    document_count_delta=1,
                )
                await audit_repo.create_audit_log(
                    tenant_id=document.tenant_id,
                    actor_user_id=document.uploader_id,
                    action="document.ingested",
                    resource_type="document",
                    resource_id=document.id,
                    details={
                        "version": document.version,
                        "parent_count": len(plan.parents),
                        "child_chunk_count": len(plan.children),
                    },
                )
                await session.commit()

                if job_id:
                    await update_job_status(job_id, "succeeded", progress=100)

            except Exception as exc:
                await session.rollback()
                async with session_factory() as err_session:
                    err_doc_repo = DocumentRepository(err_session)
                    err_audit_repo = AuditRepository(err_session)
                    await err_doc_repo.mark_failed(document_id=doc_id, tenant_id=doc_tenant_id)
                    await err_audit_repo.create_audit_log(
                        tenant_id=doc_tenant_id,
                        actor_user_id=doc_uploader_id,
                        action="document.ingest_failed",
                        resource_type="document",
                        resource_id=doc_id,
                        details={"error": type(exc).__name__},
                    )
                    await err_session.commit()
                if job_id:
                    await update_job_status(job_id, "failed", error_code=type(exc).__name__)
                raise
    finally:
        await release_document_lock(document_id)


@trace_ingestion("process_reindex_job")
async def process_reindex_job(
    document_id: uuid.UUID,
    job_id: Optional[str] = None,
) -> None:
    """Section 5.4B & 6.1: Upsert new-version points, validate, then delete old-version points."""
    create_engine()
    session_factory = get_session_factory()

    locked = await acquire_document_lock(document_id)
    if not locked:
        return

    try:
        if job_id:
            await update_job_status(job_id, "running", progress=10)

        async with session_factory() as session:
            doc_repo = DocumentRepository(session)
            audit_repo = AuditRepository(session)

            document = await doc_repo.get_for_processing(document_id)
            if document is None:
                return

            document.version += 1
            document.status = "processing"
            await doc_repo.delete_parent_contexts(tenant_id=document.tenant_id, document_id=document.id)
            await session.flush()

            raw_file = await download_object(document.storage_key)
            parsed = parse_file(raw_file, document.mime_type, filename=document.file_name)
            normalized = normalize_text(parsed.text)
            sections = split_into_sections(normalized)
            plan = build_chunk_plan(sections)

            parent_dicts = [p.to_repository_dict() for p in plan.parents]
            parent_ids = await doc_repo.create_parent_contexts(document, parent_dicts)
            vectors = await embed_texts([chunk.text for chunk in plan.children])

            await upsert_retrieval_chunks(document, plan.children, parent_ids, vectors)
            await delete_document_points(
                tenant_id=document.tenant_id,
                document_id=document.id,
                exclude_version=document.version,
            )

            await doc_repo.mark_ready(
                document_id=document.id,
                tenant_id=document.tenant_id,
                page_count=parsed.page_count,
                char_count=len(normalized),
            )
            await audit_repo.create_audit_log(
                tenant_id=document.tenant_id,
                actor_user_id=document.uploader_id,
                action="document.reindexed",
                resource_type="document",
                resource_id=document.id,
                details={"new_version": document.version, "child_chunk_count": len(plan.children)},
            )
            await session.commit()

            if job_id:
                await update_job_status(job_id, "succeeded", progress=100)
    finally:
        await release_document_lock(document_id)


async def run_worker_loop() -> None:
    """Continuous background worker loop consuming jobs from rag:{env}:queue:ingestion."""
    configure_logging()
    logger.info("Starting ingestion background worker loop")
    while True:
        job = await dequeue_job(timeout_seconds=5)
        if job is None:
            await asyncio.sleep(0.5)
            continue
        doc_id = uuid.UUID(job["document_id"])
        job_id = job["job_id"]
        op = job.get("operation", "ingest")
        try:
            if op == "reindex":
                await process_reindex_job(doc_id, job_id=job_id)
            else:
                await process_ingest_job(doc_id, job_id=job_id)
        except Exception as exc:
            logger.exception("Worker job %s failed", job_id)
            await move_to_dead_letter(job, error_code=type(exc).__name__)


if __name__ == "__main__":
    asyncio.run(run_worker_loop())