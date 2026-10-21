import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Membership, Tenant, User


class TenantRepository:
    """Tenant and Membership persistence queries."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_tenant(
        self,
        name: str,
        slug: str,
        settings: Optional[dict[str, Any]] = None,
        is_active: bool = True,
        status: str = "active",
    ) -> Tenant:
        tenant = Tenant(
            name=name.strip(),
            slug=slug.strip().lower(),
            settings=settings or {},
            is_active=is_active,
            status=status,
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

    async def get_by_name(self, name: str) -> Optional[Tenant]:
        stmt = select(Tenant).where(func.lower(Tenant.name) == name.strip().lower())
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_tenants(self, include_pending: bool = False) -> Sequence[Tenant]:
        stmt = select(Tenant)
        if not include_pending:
            stmt = stmt.where(Tenant.status == "active")
        stmt = stmt.order_by(Tenant.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_public_workspaces(self) -> Sequence[Tenant]:
        """Return non-sandbox, non-platform active workspaces available for user signup."""
        stmt = (
            select(Tenant)
            .where(Tenant.is_active.is_(True))
            .where(Tenant.status == "active")
            .order_by(Tenant.name.asc())
        )
        result = await self.session.execute(stmt)
        tenants = result.scalars().all()
        # Filter out trial sandboxes and the reserved Platform Administration workspace
        return [
            t for t in tenants
            if not (t.settings and (t.settings.get("is_sandbox") or t.settings.get("is_platform")))
            and t.slug != "platform"
            and t.name != "Platform Administration"
        ]

    async def update_tenant_status(self, tenant_id: uuid.UUID, new_status: str) -> Optional[Tenant]:
        tenant = await self.get_by_id(tenant_id)
        if tenant is None:
            return None
        tenant.status = new_status
        tenant.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        return tenant

    async def delete_tenant(self, tenant_id: uuid.UUID) -> bool:
        tenant = await self.get_by_id(tenant_id)
        if tenant is None:
            return False
        await self.session.delete(tenant)
        await self.session.flush()
        return True

    async def create_membership(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        role: str,
        status: str = "active",
    ) -> Membership:
        membership = Membership(
            user_id=user_id,
            tenant_id=tenant_id,
            role=role,
            status=status,
        )
        self.session.add(membership)
        await self.session.flush()
        return membership

    async def get_membership(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Optional[Membership]:
        stmt = (
            select(Membership)
            .options(selectinload(Membership.user), selectinload(Membership.tenant))
            .where(
                Membership.tenant_id == tenant_id,
                Membership.user_id == user_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_membership_by_id(self, membership_id: uuid.UUID) -> Optional[Membership]:
        stmt = (
            select(Membership)
            .options(selectinload(Membership.user), selectinload(Membership.tenant))
            .where(Membership.id == membership_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_user_memberships(
        self,
        user_id: uuid.UUID,
        status: Optional[str] = None,
    ) -> Sequence[Membership]:
        stmt = (
            select(Membership)
            .options(selectinload(Membership.tenant))
            .where(Membership.user_id == user_id)
        )
        if status is not None:
            stmt = stmt.where(Membership.status == status)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_tenant_memberships(
        self,
        tenant_id: uuid.UUID,
        status: Optional[str] = None,
    ) -> Sequence[Membership]:
        stmt = (
            select(Membership)
            .options(selectinload(Membership.user))
            .where(Membership.tenant_id == tenant_id)
        )
        if status is not None:
            stmt = stmt.where(Membership.status == status)
        stmt = stmt.order_by(Membership.created_at.asc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_pending_memberships(
        self,
        tenant_id: Optional[uuid.UUID] = None,
    ) -> Sequence[Membership]:
        stmt = (
            select(Membership)
            .options(selectinload(Membership.user), selectinload(Membership.tenant))
            .where(Membership.status == "pending_approval")
        )
        if tenant_id is not None:
            stmt = stmt.where(Membership.tenant_id == tenant_id)
        stmt = stmt.order_by(Membership.created_at.desc())
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
        membership.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        await self.session.refresh(membership)
        return membership

    async def update_membership_status(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        new_status: str,
    ) -> Optional[Membership]:
        membership = await self.get_membership(tenant_id=tenant_id, user_id=user_id)
        if membership is None:
            return None
        membership.status = new_status
        membership.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        await self.session.refresh(membership)
        return membership

    async def delete_membership(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        stmt = delete(Membership).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount > 0
