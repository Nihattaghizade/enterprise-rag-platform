import time
import uuid
from typing import Optional

from redis.asyncio import Redis

from app.config import get_settings
from app.core.errors import RateLimitExceededError


def get_redis_client() -> Redis:
    """Create an async Redis client using RESP2 protocol for universal compatibility."""
    settings = get_settings()
    return Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        protocol=2,
        socket_timeout=30.0,
        socket_connect_timeout=10.0,
    )


def _env_prefix() -> str:
    settings = get_settings()
    return f"rag:{settings.ENVIRONMENT}"


def build_user_ratelimit_key(user_id: uuid.UUID | str, window_bucket: int) -> str:
    """Section 5.4C: rag:{env}:ratelimit:user:{user_id}:{window}"""
    return f"{_env_prefix()}:ratelimit:user:{user_id}:{window_bucket}"


def build_tenant_ratelimit_key(tenant_id: uuid.UUID | str, window_bucket: int) -> str:
    """Section 5.4C: rag:{env}:ratelimit:tenant:{tenant_id}:{window}"""
    return f"{_env_prefix()}:ratelimit:tenant:{tenant_id}:{window_bucket}"


def build_upload_ratelimit_key(tenant_id: uuid.UUID | str, window_bucket: int) -> str:
    """Section 5.4C: rag:{env}:ratelimit:upload:{tenant_id}:{window}"""
    return f"{_env_prefix()}:ratelimit:upload:{tenant_id}:{window_bucket}"


def build_concurrent_jobs_quota_key(tenant_id: uuid.UUID | str) -> str:
    """Section 5.4C: rag:{env}:quota:concurrent_jobs:{tenant_id}"""
    return f"{_env_prefix()}:quota:concurrent_jobs:{tenant_id}"


async def _atomic_incr_with_ttl(
    redis_client: Redis,
    key: str,
    cost: int,
    window_seconds: int,
) -> int:
    """Atomically increment key and assign TTL inside a MULTI/EXEC transaction (Section 5.4C)."""
    async with redis_client.pipeline(transaction=True) as pipe:
        pipe.incrby(key, cost)
        pipe.ttl(key)
        incr_result, ttl_result = await pipe.execute()

    current_count = int(incr_result)
    if int(ttl_result) < 0:
        await redis_client.expire(key, window_seconds)
    return current_count


async def check_rate_limit(
    redis_client: Redis,
    *,
    user_id: Optional[uuid.UUID | str] = None,
    tenant_id: Optional[uuid.UUID | str] = None,
    scope: str = "api",
    user_limit: int = 60,
    tenant_limit: int = 300,
    window_seconds: int = 60,
    cost: int = 1,
) -> dict[str, int]:
    """Enforce Redis-backed per-user, per-tenant, or upload rate limits atomically."""
    window_bucket = int(time.time() // window_seconds)
    counts: dict[str, int] = {}

    if scope == "upload" and tenant_id is not None:
        upload_key = build_upload_ratelimit_key(tenant_id, window_bucket)
        upload_count = await _atomic_incr_with_ttl(redis_client, upload_key, cost, window_seconds)
        counts["upload"] = upload_count
        if upload_count > tenant_limit:
            raise RateLimitExceededError(
                "Tenant upload rate limit exceeded.",
                details={"scope": "upload", "limit": tenant_limit, "window_seconds": window_seconds},
            )
        return counts

    if user_id is not None:
        user_key = build_user_ratelimit_key(user_id, window_bucket)
        user_count = await _atomic_incr_with_ttl(redis_client, user_key, cost, window_seconds)
        counts["user"] = user_count
        if user_count > user_limit:
            raise RateLimitExceededError(
                "User rate limit exceeded.",
                details={"scope": "user", "limit": user_limit, "window_seconds": window_seconds},
            )

    if tenant_id is not None:
        tenant_key = build_tenant_ratelimit_key(tenant_id, window_bucket)
        tenant_count = await _atomic_incr_with_ttl(redis_client, tenant_key, cost, window_seconds)
        counts["tenant"] = tenant_count
        if tenant_count > tenant_limit:
            raise RateLimitExceededError(
                "Tenant rate limit exceeded.",
                details={"scope": "tenant", "limit": tenant_limit, "window_seconds": window_seconds},
            )

    return counts