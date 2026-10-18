import uuid
from typing import Any, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Membership, Tenant


class TenantRepository:
    """Tenant and Membership persistence queries."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_tenant(
        self,
        name: str,
        slug: str,
        settings: Optional[dict[str, Any]] = None,
    ) -> Tenant:
        tenant = Tenant(
            name=name.strip(),
            slug=slug.strip().lower(),
            settings=settings or {},
            is_active=True,
        )
        self.session.add(tenant)
        await self.session.flush()
        return tenant

    async def get_by_id(self, tenant_id: uuid.UUID) -> Optional[Tenant]:
        stmt = select(Tenant).where(Tenant.id == tenant_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Optional[Tenant]:
        stmt = select(Tenant).where(Tenant.slug == slug.strip().lower())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_tenants(self) -> Sequence[Tenant]:
        stmt = select(Tenant).order_by(Tenant.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_membership(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        role: str,
    ) -> Membership:
        membership = Membership(
            user_id=user_id,
            tenant_id=tenant_id,
            role=role,
        )
        self.session.add(membership)
        await self.session.flush()
        return membership

    async def get_membership(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Optional[Membership]:
        stmt = select(Membership).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_user_memberships(self, user_id: uuid.UUID) -> Sequence[Membership]:
        stmt = select(Membership).where(Membership.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_tenant_memberships(self, tenant_id: uuid.UUID) -> Sequence[Membership]:
        stmt = select(Membership).where(Membership.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update_membership_role(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        new_role: str,
    ) -> Optional[Membership]:
        membership = await self.get_membership(tenant_id=tenant_id, user_id=user_id)
        if membership is None:
            return None
        membership.role = new_role
        await self.session.flush()
        return membership