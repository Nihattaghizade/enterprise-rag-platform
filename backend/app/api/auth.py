import uuid
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.errors import ForbiddenError, UnauthorizedError
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.db.session import get_db_session
from app.schemas.auth import (
    LoginRequest,
    LogoutResponse,
    RefreshTokenRequest,
    TokenResponse,
)
from app.services.audit_service import write_audit_event

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    secure_cookie = settings.ENVIRONMENT != "development"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Authenticate user, verify tenant membership, and issue JWT access + refresh tokens."""
    settings = get_settings()
    user = await authenticate_user(session, email=payload.email, password=payload.password)

    tenant_repo = TenantRepository(session)
    if payload.tenant_id is not None:
        membership = await tenant_repo.get_membership(
            tenant_id=payload.tenant_id,
            user_id=user.id,
        )
        if membership is None:
            raise ForbiddenError("User does not belong to the specified tenant.")
    else:
        memberships = await tenant_repo.list_user_memberships(user.id)
        if not memberships:
            raise ForbiddenError("User has no tenant memberships.")
        membership = memberships[0]

    access_token = create_access_token(
        user_id=user.id,
        tenant_id=membership.tenant_id,
        role=membership.role,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        tenant_id=membership.tenant_id,
    )

    _set_auth_cookies(response, access_token, refresh_token)

    await write_audit_event(
        session,
        tenant_id=membership.tenant_id,
        actor_user_id=user.id,
        action="auth.login",
        resource_type="user",
        resource_id=user.id,
    )
    await session.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        tenant_id=membership.tenant_id,
        role=membership.role,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token_endpoint(
    response: Response,
    payload: Optional[RefreshTokenRequest] = None,
    refresh_token_cookie: Optional[str] = Cookie(default=None, alias="refresh_token"),
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Refresh an access token using a valid refresh token."""
    settings = get_settings()
    raw_refresh = (payload.refresh_token if payload else None) or refresh_token_cookie
    if not raw_refresh:
        raise UnauthorizedError("Refresh token is required.")

    decoded = decode_token(raw_refresh, expected_type="refresh")
    user_id = uuid.UUID(str(decoded["sub"]))

    user_repo = UserRepository(session)
    user = await user_repo.get_by_id(user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("User is inactive.")

    tenant_repo = TenantRepository(session)
    target_tenant_id = (
        payload.tenant_id
        if (payload and payload.tenant_id)
        else (uuid.UUID(str(decoded["tenant_id"])) if decoded.get("tenant_id") else None)
    )
    if target_tenant_id is None:
        raise ForbiddenError("Tenant context missing from refresh token.")

    membership = await tenant_repo.get_membership(tenant_id=target_tenant_id, user_id=user.id)
    if membership is None:
        raise ForbiddenError("Tenant membership is no longer active.")

    new_access = create_access_token(
        user_id=user.id,
        tenant_id=membership.tenant_id,
        role=membership.role,
    )
    new_refresh = create_refresh_token(
        user_id=user.id,
        tenant_id=membership.tenant_id,
    )
    _set_auth_cookies(response, new_access, new_refresh)

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        tenant_id=membership.tenant_id,
        role=membership.role,
    )


@router.post("/logout", response_model=LogoutResponse)
async def logout(response: Response) -> LogoutResponse:
    """Clear authentication cookies."""
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return LogoutResponse(status="logged_out")