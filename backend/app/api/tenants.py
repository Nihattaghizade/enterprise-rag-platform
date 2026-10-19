import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, require_roles
from app.core.permissions import assert_tenant_access
from app.db.session import get_db_session
from app.schemas.tenants import (
    MemberAddRequest,
    MemberRoleUpdateRequest,
    MembershipResponse,
    TenantCreateRequest,
    TenantResponse,
)
from app.services import tenant_service

router = APIRouter(prefix="/api/v1/tenants", tags=["tenants"])


@router.get("", response_model=list[TenantResponse])
async def list_tenants_endpoint(
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[TenantResponse]:
    """List tenants (requires admin role)."""
    tenants = await tenant_service.list_all_tenants(session)
    return [TenantResponse.model_validate(t) for t in tenants if t.id == ctx.tenant_id]


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_endpoint(
    payload: TenantCreateRequest,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> TenantResponse:
    """Create a new tenant workspace (requires admin role)."""
    tenant = await tenant_service.create_tenant(
        session,
        name=payload.name,
        slug=payload.slug,
        actor_user_id=ctx.user_id,
        settings=payload.settings,
    )
    return TenantResponse.model_validate(tenant)


@router.get("/{tenant_id}/members", response_model=list[MembershipResponse])
async def list_members_endpoint(
    tenant_id: uuid.UUID,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> list[MembershipResponse]:
    """List memberships for a tenant (requires admin role in that tenant)."""
    assert_tenant_access(ctx.membership, tenant_id)
    members = await tenant_service.list_tenant_members(session, tenant_id)
    return [MembershipResponse.model_validate(m) for m in members]


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
    """Add a member to a tenant (requires admin role in that tenant)."""
    assert_tenant_access(ctx.membership, tenant_id)
    membership = await tenant_service.add_member(
        session,
        tenant_id=tenant_id,
        email=payload.email,
        role=payload.role,
        actor_user_id=ctx.user_id,
        password=payload.password,
    )
    return MembershipResponse.model_validate(membership)


@router.patch("/{tenant_id}/members/{user_id}", response_model=MembershipResponse)
async def change_member_role_endpoint(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: MemberRoleUpdateRequest,
    ctx: AuthContext = Depends(require_roles("admin")),
    session: AsyncSession = Depends(get_db_session),
) -> MembershipResponse:
    """Change a member's role within a tenant (requires admin role in that tenant)."""
    assert_tenant_access(ctx.membership, tenant_id)
    membership = await tenant_service.change_member_role(
        session,
        tenant_id=tenant_id,
        target_user_id=user_id,
        new_role=payload.role,
        actor_user_id=ctx.user_id,
    )
    return MembershipResponse.model_validate(membership)