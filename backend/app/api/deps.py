import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Optional

from fastapi import Cookie, Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import decode_token
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.permissions import require_role
from app.core.rate_limit import get_redis_client
from app.db.models import Membership, Tenant, User
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.db.session import get_db_session
from app.observability.logging import tenant_id_ctx, user_id_ctx

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    """Server-derived authenticated user and tenant membership context."""

    user: User
    tenant: Tenant
    membership: Membership

    @property
    def user_id(self) -> uuid.UUID:
        return self.user.id

    @property
    def tenant_id(self) -> uuid.UUID:
        return self.membership.tenant_id

    @property
    def role(self) -> str:
        return self.membership.role


async def get_redis() -> AsyncGenerator[Redis, None]:
    client = get_redis_client()
    try:
        yield client
    finally:
        await client.aclose()


async def get_auth_context(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    access_token_cookie: Optional[str] = Cookie(default=None, alias="access_token"),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_db_session),
) -> AuthContext:
    """Resolve current user and server-verified tenant membership from JWT or httpOnly cookie."""
    raw_token = credentials.credentials if credentials else access_token_cookie
    if not raw_token:
        raise UnauthorizedError("Authentication credentials were not provided.")

    payload = decode_token(raw_token, expected_type="access")
    user_id = uuid.UUID(str(payload["sub"]))

    user_repo = UserRepository(session)
    user = await user_repo.get_by_id(user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("User account is inactive or does not exist.")

    tenant_repo = TenantRepository(session)

    # Check if user has global superadmin privileges
    all_memberships = await tenant_repo.list_user_memberships(user.id)
    is_superadmin = any(m.role == "superadmin" and m.status == "active" for m in all_memberships)

    requested_tenant_id: Optional[uuid.UUID] = None
    if x_tenant_id:
        try:
            requested_tenant_id = uuid.UUID(x_tenant_id)
        except ValueError as exc:
            raise ForbiddenError("Invalid X-Tenant-ID header format.") from exc
    elif payload.get("tenant_id"):
        requested_tenant_id = uuid.UUID(str(payload["tenant_id"]))

    if is_superadmin:
        # Superadmin can inspect any requested tenant or defaults to own primary tenant
        if requested_tenant_id is not None:
            tenant = await tenant_repo.get_by_id(requested_tenant_id)
            if tenant is None:
                raise ForbiddenError("Target tenant does not exist.", code="tenant_not_found")
            synthetic_membership = Membership(
                id=uuid.uuid4(),
                user_id=user.id,
                tenant_id=tenant.id,
                role="superadmin",
                status="active",
            )
            user_id_ctx.set(str(user.id))
            tenant_id_ctx.set(str(tenant.id))
            return AuthContext(user=user, tenant=tenant, membership=synthetic_membership)
        elif all_memberships:
            primary = all_memberships[0]
            tenant = await tenant_repo.get_by_id(primary.tenant_id)
            if tenant is not None:
                user_id_ctx.set(str(user.id))
                tenant_id_ctx.set(str(tenant.id))
                return AuthContext(user=user, tenant=tenant, membership=primary)

    # Standard non-superadmin membership resolution
    membership: Optional[Membership] = None
    if requested_tenant_id is not None:
        membership = await tenant_repo.get_membership(
            tenant_id=requested_tenant_id,
            user_id=user.id,
        )
        if membership is None:
            raise ForbiddenError(
                "User is not a member of the requested tenant.",
                code="tenant_access_denied",
            )
    else:
        active_memberships = [m for m in all_memberships if m.status == "active"]
        if not active_memberships:
            pending_memberships = [m for m in all_memberships if m.status == "pending_approval"]
            if pending_memberships:
                raise ForbiddenError(
                    "Your account is awaiting approval from your workspace administrator. You will be able to sign in once approved.",
                    code="membership_pending_approval",
                )
            raise ForbiddenError(
                "User has no active tenant memberships.",
                code="membership_required",
            )
        membership = active_memberships[0]

    if membership.status == "pending_approval":
        raise ForbiddenError(
            "Your account is awaiting approval from your workspace administrator. You will be able to sign in once approved.",
            code="membership_pending_approval",
        )

    tenant = await tenant_repo.get_by_id(membership.tenant_id)
    if tenant is None or not tenant.is_active:
        raise ForbiddenError("Tenant is inactive or does not exist.", code="tenant_inactive")

    if tenant.status == "pending":
        raise ForbiddenError(
            "The workspace is awaiting approval by a platform superadmin.",
            code="tenant_pending_approval",
        )

    user_id_ctx.set(str(user.id))
    tenant_id_ctx.set(str(membership.tenant_id))

    return AuthContext(user=user, tenant=tenant, membership=membership)


def require_roles(*allowed_roles: str):
    """FastAPI dependency enforcing RBAC roles on the resolved AuthContext."""

    async def dependency(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        require_role(ctx.membership, allowed_roles)
        return ctx

    return dependency
