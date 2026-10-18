from collections.abc import AsyncGenerator
from typing import Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import get_settings

_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def create_engine(database_url: Optional[str] = None) -> AsyncEngine:
    """Create and cache the SQLAlchemy AsyncEngine using postgresql+asyncpg."""
    global _engine, _session_factory
    if _engine is None or database_url is not None:
        settings = get_settings()
        resolved_url = database_url or settings.DATABASE_URL
        _engine = create_async_engine(
            resolved_url,
            echo=settings.DEBUG,
            poolclass=NullPool,
            future=True,
        )
        _session_factory = async_sessionmaker(
            bind=_engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the initialized async session factory."""
    global _session_factory
    if _session_factory is None:
        create_engine()
    assert _session_factory is not None
    return _session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an AsyncSession per request/operation and close cleanly."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise