import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, require_roles
from app.core.errors import NotFoundError
from app.db.models import Document, Membership, QueryLog, Tenant, User
from app.db.repositories.tenants import TenantRepository
from app.db.session import get_db_session
from app.schemas.tenants import (
    PendingApprovalResponse,
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
