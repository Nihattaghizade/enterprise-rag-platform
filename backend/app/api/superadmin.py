import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, require_roles
from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.security import hash_password
from app.db.models import Document, Membership, QueryLog, Tenant, User
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.db.session import get_db_session
from app.schemas.tenants import (
    PendingApprovalResponse,
    PlatformUserResponse,
    SuperadminCreateUserRequest,
    SuperadminOverviewResponse,
    TenantCreateRequest,
    TenantResponse,
)
from app.services import tenant_service
from app.services.audit_service import write_audit_event

router = APIRouter(prefix="/api/v1/superadmin", tags=["superadmin"])


@router.get("/overview", response_model=SuperadminOverviewResponse)
async def get_superadmin_overview(
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> SuperadminOverviewResponse:
    """Platform-wide system metrics for the Superadmin Executive Console."""
    total_tenants = (await session.execute(select(func.count(Tenant.id)))).scalar_one() or 0
    active_tenants = (
        await session.execute(
            select(func.count(Tenant.id)).where(Tenant.status == "active", Tenant.is_active.is_(True))
        )
    ).scalar_one() or 0
    pending_tenants = (
        await session.execute(
            select(func.count(Tenant.id)).where(Tenant.status == "pending")
        )
    ).scalar_one() or 0
    total_users = (await session.execute(select(func.count(User.id)))).scalar_one() or 0
    pending_members = (
        await session.execute(
            select(func.count(Membership.id)).where(Membership.status == "pending_approval")
        )
    ).scalar_one() or 0
    total_documents = (
        await session.execute(
            select(func.count(Document.id)).where(Document.deleted_at.is_(None))
        )
    ).scalar_one() or 0
    total_queries = (await session.execute(select(func.count(QueryLog.id)))).scalar_one() or 0

    return SuperadminOverviewResponse(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        pending_tenants=pending_tenants,
        total_users=total_users,
        pending_approvals=pending_members + pending_tenants,
        total_documents=total_documents,
        total_queries=total_queries,
    )


@router.get("/tenants", response_model=list[TenantResponse])
async def list_all_tenants_admin(
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[TenantResponse]:
    """List all platform workspaces including pending approval requests."""
    tenants = await tenant_service.list_all_tenants(session, include_pending=True)
    return [TenantResponse.model_validate(t) for t in tenants]


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_superadmin(
    payload: TenantCreateRequest,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> TenantResponse:
    """Superadmin directly provisions a new workspace."""
    tenant = await tenant_service.create_tenant(
        session,
        name=payload.name,
        slug=payload.slug,
        actor_user_id=ctx.user_id,
        settings=payload.settings,
        status="active",
    )
    return TenantResponse.model_validate(tenant)


@router.post("/tenants/{tenant_id}/approve", response_model=TenantResponse)
async def approve_tenant_endpoint(
    tenant_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> TenantResponse:
    """Approve a pending workspace and activate its initial administrator."""
    tenant_repo = TenantRepository(session)
    tenant = await tenant_repo.update_tenant_status(tenant_id, new_status="active")
    if tenant is None:
        raise NotFoundError("Tenant not found.")

    # Tenant and user are approved separately - do not auto-approve memberships
    await write_audit_event(
        session,
        tenant_id=tenant.id,
        actor_user_id=ctx.user_id,
        action="tenant.approved",
        resource_type="tenant",
        resource_id=tenant.id,
    )
    await session.commit()
    return TenantResponse.model_validate(tenant)


@router.post("/tenants/{tenant_id}/reject")
async def reject_tenant_endpoint(
    tenant_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Reject and delete a pending workspace proposal."""
    tenant_repo = TenantRepository(session)
    tenant = await tenant_repo.get_by_id(tenant_id)
    if tenant is None:
        raise NotFoundError("Tenant not found.")

    await tenant_repo.delete_tenant(tenant_id)
    await write_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=ctx.user_id,
        action="tenant.rejected",
        resource_type="tenant",
        resource_id=tenant_id,
    )
    await session.commit()
    return {"status": "rejected", "message": "Tenant rejected and removed."}


@router.get("/pending-members", response_model=list[PendingApprovalResponse])
async def list_all_pending_members_endpoint(
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[PendingApprovalResponse]:
    """List all pending membership requests across all workspaces in the system."""
    pending = await tenant_service.list_pending_members(session, tenant_id=None)
    return [
        PendingApprovalResponse(
            id=m.id,
            user_id=m.user_id,
            email=m.user.email if m.user else "",
            role=m.role,
            tenant_id=m.tenant_id,
            tenant_name=m.tenant.name if m.tenant else "",
            status=m.status,
            created_at=m.created_at,
        )
        for m in pending
    ]


@router.post("/members/{membership_id}/approve", response_model=PendingApprovalResponse)
async def superadmin_approve_member(
    membership_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> PendingApprovalResponse:
    """Superadmin cross-tenant approval of any pending membership."""
    tenant_repo = TenantRepository(session)
    membership = await tenant_repo.get_membership_by_id(membership_id)
    if membership is None:
        raise NotFoundError("Membership application not found.")

    membership.status = "active"
    await write_audit_event(
        session,
        tenant_id=membership.tenant_id,
        actor_user_id=ctx.user_id,
        action="membership.approved_by_superadmin",
        resource_type="membership",
        resource_id=membership.id,
    )
    await session.commit()
    return PendingApprovalResponse(
        id=membership.id,
        user_id=membership.user_id,
        email=membership.user.email if membership.user else "",
        role=membership.role,
        tenant_id=membership.tenant_id,
        tenant_name=membership.tenant.name if membership.tenant else "",
        status=membership.status,
        created_at=membership.created_at,
    )


@router.post("/members/{membership_id}/reject")
async def superadmin_reject_member(
    membership_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Superadmin cross-tenant rejection of any pending membership."""
    tenant_repo = TenantRepository(session)
    membership = await tenant_repo.get_membership_by_id(membership_id)
    if membership is None:
        raise NotFoundError("Membership application not found.")

    tenant_id = membership.tenant_id
    user_id = membership.user_id
    await tenant_repo.delete_membership(tenant_id, user_id)
    await write_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=ctx.user_id,
        action="membership.rejected_by_superadmin",
        resource_type="membership",
        resource_id=membership_id,
    )
    await session.commit()
    return {"status": "rejected", "message": "Membership application rejected."}


@router.get("/users", response_model=list[PlatformUserResponse])
async def list_all_platform_users(
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[PlatformUserResponse]:
    """Superadmin view of all registered users and their tenant memberships across the entire platform."""
    stmt = (
        select(Membership)
        .options(joinedload(Membership.user), joinedload(Membership.tenant))
        .order_by(Membership.created_at.desc())
    )
    result = await session.execute(stmt)
    memberships = result.scalars().all()

    users_with_memberships = {m.user_id for m in memberships}
    user_stmt = (
        select(User).where(User.id.notin_(users_with_memberships))
        if users_with_memberships
        else select(User)
    )
    extra_users = (await session.execute(user_stmt)).scalars().all()

    response: list[PlatformUserResponse] = []
    for m in memberships:
        response.append(
            PlatformUserResponse(
                user_id=m.user_id,
                email=m.user.email if m.user else "",
                is_active=m.user.is_active if m.user else True,
                created_at=m.created_at,
                role=m.role,
                tenant_id=m.tenant_id,
                tenant_name=m.tenant.name if m.tenant else "Unknown",
                membership_status=m.status,
                membership_id=m.id,
            )
        )
    for u in extra_users:
        response.append(
            PlatformUserResponse(
                user_id=u.id,
                email=u.email,
                is_active=u.is_active,
                created_at=u.created_at,
                role="unassigned",
                tenant_id=None,
                tenant_name="None",
                membership_status="none",
                membership_id=None,
            )
        )
    return response


@router.post("/users", response_model=PlatformUserResponse, status_code=status.HTTP_201_CREATED)
async def superadmin_create_user(
    payload: SuperadminCreateUserRequest,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> PlatformUserResponse:
    """Create a new user account with specified role and assigned workspace."""
    tenant_repo = TenantRepository(session)
    user_repo = UserRepository(session)

    # Smart tenant assignment:
    # 1. trial_viewer -> auto-assigned to Trial Sandbox
    # 2. superadmin -> auto-assigned to Platform Administration
    # 3. viewer, editor, admin -> assigned to payload.tenant_id
    if payload.role == "trial_viewer":
        stmt = (
            select(Tenant)
            .where(Tenant.is_active.is_(True))
            .where(Tenant.status == "active")
        )
        all_tenants = (await session.execute(stmt)).scalars().all()
        sandbox = next((t for t in all_tenants if t.settings and t.settings.get("is_sandbox")), None)
        if sandbox is None:
            sandbox = await tenant_repo.create_tenant(
                name="Trial Sandbox (Test)",
                slug=f"sandbox-{uuid.uuid4().hex[:8]}",
                settings={"is_sandbox": True, "max_documents": 2, "max_questions": 10},
                status="active",
            )
        target_tenant = sandbox
    elif payload.role == "superadmin":
        stmt = (
            select(Tenant)
            .where(
                (Tenant.slug == "platform")
                | (Tenant.name == "Platform Administration")
                | (Tenant.id == uuid.UUID("00000000-0000-0000-0000-000000000001"))
            )
        )
        target_tenant = (await session.execute(stmt)).scalars().first()
        if target_tenant is None:
            target_tenant = await tenant_repo.create_tenant(
                name="Platform Administration",
                slug="platform",
                settings={"is_platform": True},
                status="active",
            )
    else:
        if not payload.tenant_id:
            raise ValidationError("A workspace must be selected for this role.", code="workspace_required")
        target_tenant = await tenant_repo.get_by_id(payload.tenant_id)
        if target_tenant is None or not target_tenant.is_active:
            raise NotFoundError("The selected workspace does not exist or is inactive.")

    normalized_email = payload.email.strip().lower()
    user = await user_repo.get_by_email(normalized_email)
    if user is None:
        user = await user_repo.create(
            email=normalized_email,
            password_hash=hash_password(payload.password),
        )
    else:
        user.password_hash = hash_password(payload.password)
        user.is_active = True

    membership = await tenant_repo.get_membership(target_tenant.id, user.id)
    if membership is None:
        membership = await tenant_repo.create_membership(
            user_id=user.id,
            tenant_id=target_tenant.id,
            role=payload.role,
            status="active",
        )
    else:
        membership.role = payload.role
        membership.status = "active"

    await write_audit_event(
        session,
        tenant_id=target_tenant.id,
        actor_user_id=ctx.user_id,
        action="user.created_by_superadmin",
        resource_type="user",
        resource_id=user.id,
        details={"email": normalized_email, "role": payload.role, "tenant_name": target_tenant.name},
    )
    await session.commit()

    return PlatformUserResponse(
        user_id=user.id,
        email=user.email,
        is_active=user.is_active,
        created_at=membership.created_at,
        role=membership.role,
        tenant_id=target_tenant.id,
        tenant_name=target_tenant.name,
        membership_status=membership.status,
        membership_id=membership.id,
    )


@router.delete("/users/{user_id}")
async def superadmin_delete_user(
    user_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Superadmin endpoint to permanently delete a user account across all workspaces."""
    if user_id == ctx.user_id:
        raise ForbiddenError("You cannot delete your own active superadmin account.")

    user_repo = UserRepository(session)
    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise NotFoundError("User not found.")

    if user.email == "superadmin@enterprise.internal":
        raise ForbiddenError("The primary platform superadmin account is protected and cannot be deleted.")

    # Remove query logs for this user to satisfy foreign key constraints
    await session.execute(delete(QueryLog).where(QueryLog.user_id == user_id))

    # Reassign any documents uploaded by this user to the acting superadmin
    await session.execute(
        update(Document).where(Document.uploader_id == user_id).values(uploader_id=ctx.user_id)
    )

    # Delete memberships
    await session.execute(delete(Membership).where(Membership.user_id == user_id))

    # Delete user
    user_email = user.email
    await session.delete(user)

    await write_audit_event(
        session,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        action="user.deleted_by_superadmin",
        resource_type="user",
        resource_id=user_id,
        details={"email": user_email},
    )
    await session.commit()
    return {"status": "deleted", "message": f"User {user_email} successfully deleted."}


@router.delete("/tenants/{tenant_id}")
async def superadmin_delete_tenant(
    tenant_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Delete a workspace and cascade-delete all accounts and documents associated with it."""
    tenant_repo = TenantRepository(session)
    tenant = await tenant_repo.get_by_id(tenant_id)
    if tenant is None:
        raise NotFoundError("Workspace not found.")

    # Guard: Cannot delete Platform Administration
    if (
        tenant.slug == "platform"
        or tenant.name == "Platform Administration"
        or (tenant.settings and tenant.settings.get("is_platform"))
        or str(tenant.id) == "00000000-0000-0000-0000-000000000001"
    ):
        raise ForbiddenError("This tenant is for superadmins and cannot be deleted.")

    # Retrieve all member user_ids attached to this tenant
    member_stmt = select(Membership.user_id).where(Membership.tenant_id == tenant_id)
    member_user_ids = (await session.execute(member_stmt)).scalars().all()

    # Clean up Qdrant points for this tenant if possible
    try:
        from app.ingestion.index import delete_document_points
        doc_stmt = select(Document.id).where(Document.tenant_id == tenant_id)
        doc_ids = (await session.execute(doc_stmt)).scalars().all()
        for doc_id in doc_ids:
            try:
                await delete_document_points(tenant_id=tenant_id, document_id=doc_id)
            except Exception:
                pass
    except Exception:
        pass

    # Delete query logs and audit logs for this tenant
    await session.execute(delete(QueryLog).where(QueryLog.tenant_id == tenant_id))

    # Delete memberships for this tenant
    await session.execute(delete(Membership).where(Membership.tenant_id == tenant_id))

    # Delete the tenant (cascades to documents and parent contexts in Postgres)
    tenant_name = tenant.name
    await session.delete(tenant)

    # Delete attached non-superadmin users who only belong to this workspace
    for uid in member_user_ids:
        u = await session.get(User, uid)
        if u and u.email != "superadmin@enterprise.internal" and uid != ctx.user_id:
            remaining_m = (
                await session.execute(select(func.count(Membership.id)).where(Membership.user_id == uid))
            ).scalar_one() or 0
            if remaining_m == 0:
                await session.execute(delete(QueryLog).where(QueryLog.user_id == uid))
                await session.delete(u)

    await write_audit_event(
        session,
        tenant_id=ctx.tenant_id,
        actor_user_id=ctx.user_id,
        action="tenant.deleted_by_superadmin",
        resource_type="tenant",
        resource_id=tenant_id,
        details={"tenant_name": tenant_name},
    )
    await session.commit()
    return {"status": "deleted", "message": f"Workspace {tenant_name} and associated user accounts deleted successfully."}
