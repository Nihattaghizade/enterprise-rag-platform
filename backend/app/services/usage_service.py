import uuid
from datetime import date
from typing import Optional

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import RateLimitExceededError
from app.core.rate_limit import build_concurrent_jobs_quota_key, get_redis_client
from app.db.models import UsageRecord
from app.db.repositories.audit import AuditRepository
from app.db.repositories.tenants import TenantRepository


async def record_model_usage(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    embedding_tokens: int = 0,
    rerank_calls: int = 0,
    rerank_pairs: int = 0,
    llm_input_tokens: int = 0,
    llm_output_tokens: int = 0,
    storage_bytes_delta: int = 0,
    document_count_delta: int = 0,
) -> UsageRecord:
    """Section 9: Token, model, and storage accounting in usage_records."""
    repo = AuditRepository(session)
    return await repo.increment_usage_record(
        tenant_id=tenant_id,
        usage_date=date.today(),
        embedding_tokens=embedding_tokens,
        rerank_calls=rerank_calls,
        rerank_pairs=rerank_pairs,
        llm_input_tokens=llm_input_tokens,
        llm_output_tokens=llm_output_tokens,
        storage_bytes_delta=storage_bytes_delta,
        document_count_delta=document_count_delta,
    )


async def check_quota(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    redis_client: Optional[Redis] = None,
    max_concurrent_jobs: int = 10,
) -> bool:
    """Section 9 & 5.4C: Verify tenant quota and active concurrent jobs limit."""
    tenant_repo = TenantRepository(session)
    tenant = await tenant_repo.get_by_id(tenant_id)
    if tenant is not None and isinstance(tenant.settings, dict):
        max_concurrent_jobs = int(tenant.settings.get("max_concurrent_jobs", max_concurrent_jobs))

    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    try:
        quota_key = build_concurrent_jobs_quota_key(tenant_id)
        active_raw = await client.get(quota_key)
        active_jobs = int(active_raw) if active_raw else 0
        if active_jobs >= max_concurrent_jobs:
            raise RateLimitExceededError(
                "Tenant concurrent ingestion job quota exceeded.",
                code="concurrent_jobs_quota_exceeded",
                details={"active_jobs": active_jobs, "max_concurrent_jobs": max_concurrent_jobs},
            )
        return True
    finally:
        if owns_client:
            await client.aclose()