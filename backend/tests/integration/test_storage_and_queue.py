import uuid

import pytest
from redis.asyncio import Redis

from app.core.rate_limit import get_redis_client
from app.storage.minio_client import ensure_bucket
from app.storage.s3_adapter import (
    build_original_object_key,
    build_parent_context_object_key,
    create_presigned_download_url,
    delete_object,
    download_object,
    upload_original,
    upload_parent_context_text,
)
from app.tasks.queue import (
    acquire_document_lock,
    dequeue_job,
    enqueue_ingest,
    enqueue_reindex,
    get_dead_letter_queue_key,
    get_ingestion_queue_key,
    get_job_status,
    move_to_dead_letter,
    release_document_lock,
    update_job_status,
)


@pytest.fixture
async def redis_client() -> Redis:
    client = get_redis_client()
    yield client
    await client.aclose()


def test_minio_object_key_layouts() -> None:
    tid = uuid.uuid4()
    did = uuid.uuid4()
    pid = uuid.uuid4()

    orig_key = build_original_object_key(tid, did, 1, "policy.pdf")
    assert orig_key == f"tenants/{tid}/documents/{did}/versions/1/original/policy.pdf"

    parent_key = build_parent_context_object_key(tid, did, 1, pid)
    assert parent_key == f"tenants/{tid}/documents/{did}/versions/1/parents/{pid}.txt"


async def test_minio_storage_lifecycle() -> None:
    bucket = await ensure_bucket()
    assert bucket == "rag-documents"

    tenant_id = uuid.uuid4()
    document_id = uuid.uuid4()
    user_id = uuid.uuid4()
    raw_bytes = b"Enterprise RAG test document content for MinIO storage."

    storage_key = await upload_original(
        tenant_id=tenant_id,
        document_id=document_id,
        version=1,
        filename="handbook.txt",
        content=raw_bytes,
        mime_type="text/plain",
        uploaded_by=user_id,
    )
    assert storage_key.startswith(f"tenants/{tenant_id}/documents/{document_id}/versions/1/original/")

    downloaded = await download_object(storage_key)
    assert downloaded == raw_bytes

    presigned_url = await create_presigned_download_url(storage_key)
    assert "rag-documents" in presigned_url

    parent_id = uuid.uuid4()
    parent_key = await upload_parent_context_text(
        tenant_id=tenant_id,
        document_id=document_id,
        version=1,
        parent_id=parent_id,
        text="Large parent context body.",
    )
    parent_bytes = await download_object(parent_key)
    assert parent_bytes.decode("utf-8") == "Large parent context body."

    await delete_object(storage_key)
    await delete_object(parent_key)


async def test_redis_ingestion_queue_and_locks(redis_client: Redis) -> None:
    await redis_client.delete(get_ingestion_queue_key(), get_dead_letter_queue_key())

    tenant_id = uuid.uuid4()
    document_id = uuid.uuid4()

    # Distributed lock prevents duplicate concurrent ingest
    assert await acquire_document_lock(document_id, redis_client=redis_client) is True
    assert await acquire_document_lock(document_id, redis_client=redis_client) is False
    await release_document_lock(document_id, redis_client=redis_client)
    assert await acquire_document_lock(document_id, redis_client=redis_client) is True
    await release_document_lock(document_id, redis_client=redis_client)

    # Enqueue ingest and reindex jobs
    ingest_job = await enqueue_ingest(document_id=document_id, tenant_id=tenant_id, redis_client=redis_client)
    reindex_job = await enqueue_reindex(document_id=document_id, tenant_id=tenant_id, redis_client=redis_client)

    status = await get_job_status(ingest_job["job_id"], redis_client=redis_client)
    assert status is not None
    assert status["status"] == "queued"

    popped_1 = await dequeue_job(redis_client=redis_client)
    assert popped_1 is not None
    assert popped_1["job_id"] == ingest_job["job_id"]
    assert popped_1["operation"] == "ingest"

    await update_job_status(popped_1["job_id"], "succeeded", progress=100, redis_client=redis_client)
    done_status = await get_job_status(popped_1["job_id"], redis_client=redis_client)
    assert done_status is not None
    assert done_status["status"] == "succeeded"

    popped_2 = await dequeue_job(redis_client=redis_client)
    assert popped_2 is not None
    assert popped_2["job_id"] == reindex_job["job_id"]
    assert popped_2["operation"] == "reindex"

    await move_to_dead_letter(popped_2, error_code="parse_failed", redis_client=redis_client)
    failed_status = await get_job_status(popped_2["job_id"], redis_client=redis_client)
    assert failed_status is not None
    assert failed_status["status"] == "failed"
    assert failed_status["error_code"] == "parse_failed"