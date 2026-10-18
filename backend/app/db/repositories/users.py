import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


class UserRepository:
    """Persistence queries for User entities."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        email: str,
        password_hash: str,
        is_active: bool = True,
        metadata: Optional[dict[str, Any]] = None,
    ) -> User:
        user = User(
            email=email.strip().lower(),
            password_hash=password_hash,
            is_active=is_active,
            metadata_=metadata or {},
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        stmt = select(User).where(User.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(User.email == email.strip().lower())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()