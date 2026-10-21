import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, require_roles
from app.core.errors import NotFoundError
from app.core.permissions import assert_tenant_access
from app.db.repositories.tenants import TenantRepository
from app.db.session import get_db_session
from app.schemas.tenants import (
    MemberAddRequest,
    MemberRoleUpdateRequest,
    MembershipResponse,
    PendingApprovalResponse,
    TenantCreateRequest,
    TenantResponse,
    TrialStatusResponse,
)
from app.services import tenant_service

router = APIRouter(prefix="/api/v1/tenants", tags=["tenants"])


@router.get("", response_model=list[TenantResponse])
async def list_tenants_endpoint(
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[TenantResponse]:
    """List tenants (superadmin sees all, tenant admin sees own workspace)."""
    tenants = await tenant_service.list_all_tenants(session)
    if ctx.role == "superadmin":
        return [TenantResponse.model_validate(t) for t in tenants]
    return [TenantResponse.model_validate(t) for t in tenants if t.id == ctx.tenant_id]


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant_endpoint(
    tenant_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin", "editor", "viewer", "trial_viewer")),
    session: AsyncSession = Depends(get_db_session),
) -> TenantResponse:
    """Get single workspace details by ID."""
    assert_tenant_access(ctx.membership, tenant_id)
    tenant_repo = TenantRepository(session)
    tenant = await tenant_repo.get_by_id(tenant_id)
    if tenant is None:
        raise NotFoundError("Workspace not found.")
    return TenantResponse.model_validate(tenant)



@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_endpoint(
    payload: TenantCreateRequest,
    ctx: AuthContext = Depends(require_roles("superadmin")),
    session: AsyncSession = Depends(get_db_session),
) -> TenantResponse:
    """Create a new tenant workspace (requires superadmin role)."""
    tenant = await tenant_service.create_tenant(
        session,
        name=payload.name,
        slug=payload.slug,
        actor_user_id=ctx.user_id,
        settings=payload.settings,
    )
    return TenantResponse.model_validate(tenant)


@router.get("/{tenant_id}/trial-status", response_model=TrialStatusResponse)
async def get_trial_status_endpoint(
    tenant_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> TrialStatusResponse:
    """Retrieve trial usage counters and limits for sandbox evaluation accounts."""
    assert_tenant_access(ctx.membership, tenant_id)
    return await tenant_service.get_trial_status(
        session, tenant_id=tenant_id, user_id=ctx.user_id, role=ctx.membership.role
    )


@router.get("/{tenant_id}/members", response_model=list[MembershipResponse])
async def list_members_endpoint(
    tenant_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[MembershipResponse]:
    """List active memberships for a tenant."""
    assert_tenant_access(ctx.membership, tenant_id)
    members = await tenant_service.list_tenant_members(session, tenant_id, status="active")
    return [
        MembershipResponse(
            id=m.id,
            user_id=m.user_id,
            tenant_id=m.tenant_id,
            role=m.role,
            status=m.status,
            email=m.user.email if m.user else None,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in members
    ]


@router.get("/{tenant_id}/pending-members", response_model=list[PendingApprovalResponse])
async def list_pending_members_endpoint(
    tenant_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[PendingApprovalResponse]:
    """List pending membership approval requests for a tenant."""
    assert_tenant_access(ctx.membership, tenant_id)
    pending = await tenant_service.list_pending_members(session, tenant_id=tenant_id)
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


@router.post(
    "/{tenant_id}/members",
    response_model=MembershipResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_member_endpoint(
    tenant_id: uuid.UUID,
    payload: MemberAddRequest,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> MembershipResponse:
    """Add a member directly to own workspace (can add admin, editor, or viewer)."""
    assert_tenant_access(ctx.membership, tenant_id)
    membership = await tenant_service.add_member(
        session,
        tenant_id=tenant_id,
        email=payload.email,
        role=payload.role,
        actor_user_id=ctx.user_id,
        password=payload.password,
        status="active",
    )
    return MembershipResponse(
        id=membership.id,
        user_id=membership.user_id,
        tenant_id=membership.tenant_id,
        role=membership.role,
        status=membership.status,
        email=membership.user.email if membership.user else payload.email,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


@router.patch("/{tenant_id}/members/{user_id}", response_model=MembershipResponse)
async def change_member_role_endpoint(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: MemberRoleUpdateRequest,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> MembershipResponse:
    """Change a member's role within a tenant."""
    assert_tenant_access(ctx.membership, tenant_id)
    membership = await tenant_service.change_member_role(
        session,
        tenant_id=tenant_id,
        target_user_id=user_id,
        new_role=payload.role,
        actor_user_id=ctx.user_id,
    )
    return MembershipResponse(
        id=membership.id,
        user_id=membership.user_id,
        tenant_id=membership.tenant_id,
        role=membership.role,
        status=membership.status,
        email=membership.user.email if membership.user else None,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


@router.post("/{tenant_id}/members/{user_id}/approve", response_model=MembershipResponse)
async def approve_member_endpoint(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> MembershipResponse:
    """Approve a pending membership application for this workspace."""
    assert_tenant_access(ctx.membership, tenant_id)
    membership = await tenant_service.approve_pending_member(
        session,
        tenant_id=tenant_id,
        target_user_id=user_id,
        actor_user_id=ctx.user_id,
    )
    return MembershipResponse(
        id=membership.id,
        user_id=membership.user_id,
        tenant_id=membership.tenant_id,
        role=membership.role,
        status=membership.status,
        email=membership.user.email if membership.user else None,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


@router.post("/{tenant_id}/members/{user_id}/reject")
async def reject_member_endpoint(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Reject and dismiss a pending membership application."""
    assert_tenant_access(ctx.membership, tenant_id)
    await tenant_service.reject_pending_member(
        session,
        tenant_id=tenant_id,
        target_user_id=user_id,
        actor_user_id=ctx.user_id,
    )
    return {"status": "rejected", "message": "Membership application rejected."}


@router.delete("/{tenant_id}/members/{user_id}")
async def delete_member_endpoint(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Delete a member from own workspace."""
    assert_tenant_access(ctx.membership, tenant_id)
    await tenant_service.delete_member(
        session,
        tenant_id=tenant_id,
        target_user_id=user_id,
        actor_user_id=ctx.user_id,
    )
    return {"status": "deleted", "message": "Member removed from workspace."}
