import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from redis.asyncio import Redis

from app.config import get_settings
from app.core.rate_limit import get_redis_client


def _env_prefix() -> str:
    settings = get_settings()
    return f"rag:{settings.ENVIRONMENT}"


def get_ingestion_queue_key() -> str:
    """Section 5.4C: rag:{env}:queue:ingestion"""
    return f"{_env_prefix()}:queue:ingestion"


def get_dead_letter_queue_key() -> str:
    """Section 5.4C: rag:{env}:queue:dead_letter"""
    return f"{_env_prefix()}:queue:dead_letter"


def get_job_status_key(job_id: uuid.UUID | str) -> str:
    """Section 5.4C: rag:{env}:job:{job_id}"""
    return f"{_env_prefix()}:job:{job_id}"


def get_document_lock_key(document_id: uuid.UUID | str) -> str:
    """Section 5.4C: rag:{env}:lock:document:{document_id}"""
    return f"{_env_prefix()}:lock:document:{document_id}"


async def acquire_document_lock(
    document_id: uuid.UUID,
    ttl_seconds: int = 900,
    redis_client: Optional[Redis] = None,
) -> bool:
    """Acquire distributed lock to prevent duplicate concurrent ingest/reindex."""
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        lock_key = get_document_lock_key(document_id)
        acquired = await client.set(lock_key, "locked", nx=True, ex=ttl_seconds)
        return bool(acquired)
    finally:
        if owns_client:
            await client.aclose()


async def release_document_lock(
    document_id: uuid.UUID,
    redis_client: Optional[Redis] = None,
) -> None:
    """Release distributed ingest lock for a document."""
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        lock_key = get_document_lock_key(document_id)
        await client.delete(lock_key)
    finally:
        if owns_client:
            await client.aclose()


async def update_job_status(
    job_id: uuid.UUID | str,
    status: str,
    *,
    progress: int = 0,
    error_code: Optional[str] = None,
    ttl_seconds: int = 86400,
    redis_client: Optional[Redis] = None,
) -> dict[str, Any]:
    """Update rag:{env}:job:{job_id} status record (queued, running, succeeded, failed)."""
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        payload: dict[str, Any] = {
            "job_id": str(job_id),
            "status": status,
            "progress": progress,
            "error_code": error_code,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await client.set(get_job_status_key(job_id), json.dumps(payload), ex=ttl_seconds)
        return payload
    finally:
        if owns_client:
            await client.aclose()


async def get_job_status(
    job_id: uuid.UUID | str,
    redis_client: Optional[Redis] = None,
) -> Optional[dict[str, Any]]:
    """Read job status JSON from rag:{env}:job:{job_id}."""
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        raw = await client.get(get_job_status_key(job_id))
        if not raw:
            return None
        return json.loads(raw)
    finally:
        if owns_client:
            await client.aclose()


async def _enqueue_job(
    *,
    document_id: uuid.UUID,
    tenant_id: uuid.UUID,
    operation: str,
    attempt_count: int = 1,
    redis_client: Optional[Redis] = None,
) -> dict[str, Any]:
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        job_id = str(uuid.uuid4())
        job_entry: dict[str, Any] = {
            "job_id": job_id,
            "document_id": str(document_id),
            "tenant_id": str(tenant_id),
            "operation": operation,
            "attempt_count": attempt_count,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await update_job_status(job_id, "queued", progress=0, redis_client=client)
        await client.rpush(get_ingestion_queue_key(), json.dumps(job_entry))
        return job_entry
    finally:
        if owns_client:
            await client.aclose()


async def enqueue_ingest(
    document_id: uuid.UUID,
    tenant_id: uuid.UUID,
    redis_client: Optional[Redis] = None,
) -> dict[str, Any]:
    """Section 11: Enqueue an asynchronous document ingestion job."""
    return await _enqueue_job(
        document_id=document_id,
        tenant_id=tenant_id,
        operation="ingest",
        redis_client=redis_client,
    )


async def enqueue_reindex(
    document_id: uuid.UUID,
    tenant_id: uuid.UUID,
    redis_client: Optional[Redis] = None,
) -> dict[str, Any]:
    """Section 11: Enqueue an asynchronous document reindex job."""
    return await _enqueue_job(
        document_id=document_id,
        tenant_id=tenant_id,
        operation="reindex",
        redis_client=redis_client,
    )


async def dequeue_job(
    timeout_seconds: int = 0,
    redis_client: Optional[Redis] = None,
) -> Optional[dict[str, Any]]:
    """Pop the next pending job from rag:{env}:queue:ingestion."""
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        queue_key = get_ingestion_queue_key()
        if timeout_seconds > 0:
            try:
                item = await client.blpop(queue_key, timeout=timeout_seconds)
            except TimeoutError:
                return None
            if not item:
                return None
            _, raw_payload = item
            return json.loads(raw_payload)
        raw_payload = await client.lpop(queue_key)
        if not raw_payload:
            return None
        return json.loads(raw_payload)
    finally:
        if owns_client:
            await client.aclose()


async def move_to_dead_letter(
    job_entry: dict[str, Any],
    error_code: str,
    redis_client: Optional[Redis] = None,
) -> None:
    """Push a permanently failed job onto rag:{env}:queue:dead_letter."""
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        dead_entry = {
            **job_entry,
            "error_code": error_code,
            "failed_at": datetime.now(timezone.utc).isoformat(),
        }
        await client.rpush(get_dead_letter_queue_key(), json.dumps(dead_entry))
        await update_job_status(
            job_entry["job_id"],
            "failed",
            error_code=error_code,
            redis_client=client,
        )
    finally:
        if owns_client:
            await client.aclose()