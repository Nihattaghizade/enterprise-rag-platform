import uuid
from typing import Any, Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.permissions import validate_role
from app.core.security import hash_password
from app.db.models import Document, Membership, QueryLog, Tenant
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.schemas.tenants import TrialStatusResponse
from app.services.audit_service import write_audit_event


async def create_tenant(
    session: AsyncSession,
    *,
    name: str,
    slug: str,
    actor_user_id: uuid.UUID,
    settings: Optional[dict[str, Any]] = None,
    status: str = "active",
) -> Tenant:
    """Create a new tenant workspace and assign the creator as admin."""
    tenant_repo = TenantRepository(session)
    existing = await tenant_repo.get_by_slug(slug)
    if existing is not None:
        raise ValidationError(f"Tenant slug '{slug}' already exists.", code="duplicate_slug")

    tenant = await tenant_repo.create_tenant(
        name=name,
        slug=slug,
        settings=settings,
        status=status,
    )
    membership_status = "active" if status == "active" else "pending_approval"
    await tenant_repo.create_membership(
        user_id=actor_user_id,
        tenant_id=tenant.id,
        role="admin",
        status=membership_status,
    )
    await write_audit_event(
        session,
        tenant_id=tenant.id,
        actor_user_id=actor_user_id,
        action="tenant.created",
        resource_type="tenant",
        resource_id=tenant.id,
        details={"slug": tenant.slug, "status": status},
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
    status: str = "active",
) -> Membership:
    """Add a user to a tenant with the specified role."""
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
        status=status,
    )
    await write_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        action="membership.added",
        resource_type="membership",
        resource_id=membership.id,
        details={"user_id": str(user.id), "email": user.email, "role": validated_role, "status": status},
    )
    await session.commit()
    # Ensure relationships are loaded for response serialization
    return await tenant_repo.get_membership(tenant_id=tenant_id, user_id=user.id)  # type: ignore


async def change_member_role(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    target_user_id: uuid.UUID,
    new_role: str,
    actor_user_id: uuid.UUID,
) -> Membership:
    """Change an existing tenant member's role."""
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


async def delete_member(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    target_user_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> bool:
    """Delete a member from a tenant workspace."""
    tenant_repo = TenantRepository(session)
    membership = await tenant_repo.get_membership(tenant_id=tenant_id, user_id=target_user_id)
    if membership is None:
        raise NotFoundError("Member not found in workspace.")

    # Guard: prevent removing the last admin
    if membership.role == "admin":
        members = await tenant_repo.list_tenant_memberships(tenant_id=tenant_id, status="active")
        admins = [m for m in members if m.role == "admin"]
        if len(admins) <= 1 and admins[0].user_id == target_user_id:
            raise ValidationError(
                "Cannot remove the last administrator from this workspace.",
                code="cannot_remove_last_admin",
            )

    deleted = await tenant_repo.delete_membership(tenant_id=tenant_id, user_id=target_user_id)
    if deleted:
        await write_audit_event(
            session,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="membership.deleted",
            resource_type="membership",
            resource_id=membership.id,
            details={"target_user_id": str(target_user_id), "role": membership.role},
        )
        await session.commit()
    return deleted


async def approve_pending_member(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    target_user_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> Membership:
    """Approve a pending member request for a workspace."""
    tenant_repo = TenantRepository(session)
    membership = await tenant_repo.get_membership(tenant_id=tenant_id, user_id=target_user_id)
    if membership is None:
        raise NotFoundError("Membership application not found.")

    if membership.status == "active":
        return membership

    updated = await tenant_repo.update_membership_status(
        tenant_id=tenant_id,
        user_id=target_user_id,
        new_status="active",
    )
    await write_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        action="membership.approved",
        resource_type="membership",
        resource_id=membership.id,
        details={"target_user_id": str(target_user_id), "role": membership.role},
    )
    await session.commit()
    return updated  # type: ignore


async def reject_pending_member(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    target_user_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> bool:
    """Reject and delete a pending membership request."""
    tenant_repo = TenantRepository(session)
    membership = await tenant_repo.get_membership(tenant_id=tenant_id, user_id=target_user_id)
    if membership is None:
        raise NotFoundError("Membership application not found.")

    deleted = await tenant_repo.delete_membership(tenant_id=tenant_id, user_id=target_user_id)
    if deleted:
        await write_audit_event(
            session,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="membership.rejected",
            resource_type="membership",
            resource_id=membership.id,
            details={"target_user_id": str(target_user_id)},
        )
        await session.commit()
    return deleted


async def list_all_tenants(session: AsyncSession, include_pending: bool = False) -> Sequence[Tenant]:
    repo = TenantRepository(session)
    return await repo.list_tenants(include_pending=include_pending)


async def list_public_workspaces(session: AsyncSession) -> Sequence[Tenant]:
    repo = TenantRepository(session)
    return await repo.list_public_workspaces()


async def list_tenant_members(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    status: Optional[str] = None,
) -> Sequence[Membership]:
    repo = TenantRepository(session)
    return await repo.list_tenant_memberships(tenant_id, status=status)


async def list_pending_members(
    session: AsyncSession,
    tenant_id: Optional[uuid.UUID] = None,
) -> Sequence[Membership]:
    repo = TenantRepository(session)
    return await repo.list_pending_memberships(tenant_id)


async def get_trial_status(
    session: AsyncSession,
    tenant_id: uuid.UUID,
) -> TrialStatusResponse:
    """Check if tenant is in sandbox trial evaluation and return limits and current counters."""
    tenant_repo = TenantRepository(session)
    tenant = await tenant_repo.get_by_id(tenant_id)
    if tenant is None:
        raise NotFoundError("Tenant not found.")

    is_sandbox = bool(tenant.settings and tenant.settings.get("is_sandbox"))
    if not is_sandbox:
        return TrialStatusResponse(
            is_trial=False,
            documents_uploaded=0,
            max_documents=999999,
            questions_asked=0,
            max_questions=999999,
        )

    max_docs = int(tenant.settings.get("max_documents", 2))
    max_questions = int(tenant.settings.get("max_questions", 10))

    # Count uploaded documents
    doc_count_stmt = select(func.count(Document.id)).where(
        Document.tenant_id == tenant_id,
        Document.deleted_at.is_(None),
    )
    doc_count_res = await session.execute(doc_count_stmt)
    docs_uploaded = doc_count_res.scalar_one() or 0

    # Count questions asked
    query_count_stmt = select(func.count(QueryLog.id)).where(
        QueryLog.tenant_id == tenant_id,
    )
    query_count_res = await session.execute(query_count_stmt)
    queries_asked = query_count_res.scalar_one() or 0

    return TrialStatusResponse(
        is_trial=True,
        documents_uploaded=docs_uploaded,
        max_documents=max_docs,
        questions_asked=queries_asked,
        max_questions=max_questions,
    )
