import uuid
from typing import Any, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.core.permissions import validate_role
from app.core.security import hash_password
from app.db.models import Membership, Tenant
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.services.audit_service import write_audit_event


async def create_tenant(
    session: AsyncSession,
    *,
    name: str,
    slug: str,
    actor_user_id: uuid.UUID,
    settings: Optional[dict[str, Any]] = None,
) -> Tenant:
    """Section 9: Create a new tenant and assign the creator as admin."""
    tenant_repo = TenantRepository(session)
    existing = await tenant_repo.get_by_slug(slug)
    if existing is not None:
        raise ValidationError(f"Tenant slug '{slug}' already exists.", code="duplicate_slug")

    tenant = await tenant_repo.create_tenant(name=name, slug=slug, settings=settings)
    await tenant_repo.create_membership(
        user_id=actor_user_id,
        tenant_id=tenant.id,
        role="admin",
    )
    await write_audit_event(
        session,
        tenant_id=tenant.id,
        actor_user_id=actor_user_id,
        action="tenant.created",
        resource_type="tenant",
        resource_id=tenant.id,
        details={"slug": tenant.slug},
    )
    await session.commit()
    return tenant


async def add_member(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    email: str,
    role: str,
    actor_user_id: uuid.UUID,
    password: Optional[str] = None,
) -> Membership:
    """Section 9: Add a user to a tenant with the specified role."""
    validated_role = validate_role(role)
    user_repo = UserRepository(session)
    tenant_repo = TenantRepository(session)

    tenant = await tenant_repo.get_by_id(tenant_id)
    if tenant is None:
        raise NotFoundError("Tenant not found.")

    user = await user_repo.get_by_email(email)
    if user is None:
        if not password:
            raise ValidationError(
                "Password is required when creating a new user account.",
                code="password_required",
            )
        user = await user_repo.create(
            email=email,
            password_hash=hash_password(password),
        )

    existing_membership = await tenant_repo.get_membership(tenant_id=tenant_id, user_id=user.id)
    if existing_membership is not None:
        raise ValidationError("User is already a member of this tenant.", code="already_member")

    membership = await tenant_repo.create_membership(
        user_id=user.id,
        tenant_id=tenant_id,
        role=validated_role,
    )
    await write_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        action="membership.added",
        resource_type="membership",
        resource_id=membership.id,
        details={"user_id": str(user.id), "email": user.email, "role": validated_role},
    )
    await session.commit()
    return membership


async def change_member_role(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    target_user_id: uuid.UUID,
    new_role: str,
    actor_user_id: uuid.UUID,
) -> Membership:
    """Section 9: Change an existing tenant member's role."""
    validated_role = validate_role(new_role)
    tenant_repo = TenantRepository(session)

    updated = await tenant_repo.update_membership_role(
        tenant_id=tenant_id,
        user_id=target_user_id,
        new_role=validated_role,
    )
    if updated is None:
        raise NotFoundError("Membership not found in tenant.")

    await write_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        action="membership.role_changed",
        resource_type="membership",
        resource_id=updated.id,
        details={"target_user_id": str(target_user_id), "new_role": validated_role},
    )
    await session.commit()
    return updated


async def list_all_tenants(session: AsyncSession) -> Sequence[Tenant]:
    repo = TenantRepository(session)
    return await repo.list_tenants()


async def list_tenant_members(
    session: AsyncSession,
    tenant_id: uuid.UUID,
) -> Sequence[Membership]:
    repo = TenantRepository(session)
    return await repo.list_tenant_memberships(tenant_id)