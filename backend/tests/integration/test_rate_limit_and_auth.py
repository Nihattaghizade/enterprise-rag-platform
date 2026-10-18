import uuid

import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import authenticate_user
from app.core.errors import RateLimitExceededError, UnauthorizedError
from app.core.rate_limit import check_rate_limit, get_redis_client
from app.core.security import hash_password
from app.db.repositories.users import UserRepository
from app.db.session import create_engine, get_session_factory


@pytest.fixture
async def db_session() -> AsyncSession:
    create_engine()
    factory = get_session_factory()
    async with factory() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def redis_client() -> Redis:
    client = get_redis_client()
    yield client
    await client.aclose()


async def test_authenticate_user_flow(db_session: AsyncSession) -> None:
    repo = UserRepository(db_session)
    email = f"auth-{uuid.uuid4().hex[:8]}@example.com"
    await repo.create(email=email, password_hash=hash_password("ValidPass123!"))

    authenticated = await authenticate_user(db_session, email=email, password="ValidPass123!")
    assert authenticated.email == email

    with pytest.raises(UnauthorizedError):
        await authenticate_user(db_session, email=email, password="WrongPassword123!")


async def test_redis_rate_limiting(redis_client: Redis) -> None:
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    counts_1 = await check_rate_limit(
        redis_client,
        user_id=user_id,
        tenant_id=tenant_id,
        user_limit=2,
        tenant_limit=5,
        window_seconds=60,
    )
    assert counts_1["user"] == 1
    assert counts_1["tenant"] == 1

    counts_2 = await check_rate_limit(
        redis_client,
        user_id=user_id,
        tenant_id=tenant_id,
        user_limit=2,
        tenant_limit=5,
        window_seconds=60,
    )
    assert counts_2["user"] == 2

    with pytest.raises(RateLimitExceededError):
        await check_rate_limit(
            redis_client,
            user_id=user_id,
            tenant_id=tenant_id,
            user_limit=2,
            tenant_limit=5,
            window_seconds=60,
        )