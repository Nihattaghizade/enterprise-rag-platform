import re
import uuid
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from app.core.security import hash_password
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.db.session import get_db_session
from app.schemas.auth import (
    LoginRequest,
    LogoutResponse,
    RefreshTokenRequest,
    SignUpRequest,
    SignUpResponse,
    TokenResponse,
    WorkspaceOption,
)
from app.services import tenant_service
from app.services.audit_service import write_audit_event

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[-\s]+", "-", cleaned)


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


@router.get("/workspaces", response_model=list[WorkspaceOption])
async def list_workspaces_for_signup(
    session: AsyncSession = Depends(get_db_session),
) -> list[WorkspaceOption]:
    """Retrieve active non-sandbox workspace names and identifiers for user registration."""
    workspaces = await tenant_service.list_public_workspaces(session)
    return [WorkspaceOption(id=w.id, name=w.name, slug=w.slug) for w in workspaces]


@router.post("/signup", response_model=SignUpResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignUpRequest,
    session: AsyncSession = Depends(get_db_session),
) -> SignUpResponse:
    """Register a new account as Trial Viewer, Viewer, Editor, or Admin."""
    user_repo = UserRepository(session)
    tenant_repo = TenantRepository(session)

    normalized_email = payload.email.strip().lower()
    user = await user_repo.get_by_email(normalized_email)
    if user is None:
        user = await user_repo.create(
            email=normalized_email,
            password_hash=hash_password(payload.password),
        )

    # 1. TRIAL VIEWER: Instant test sandbox with 2 files, 10 AI queries limit
    if payload.role == "trial_viewer":
        sandbox_slug = f"sandbox-{uuid.uuid4().hex[:8]}"
        display_prefix = normalized_email.split("@")[0].title()
        sandbox_tenant = await tenant_repo.create_tenant(
            name=f"Trial Sandbox ({display_prefix})",
            slug=sandbox_slug,
            settings={"is_sandbox": True, "max_documents": 2, "max_questions": 10},
            status="active",
        )
        membership = await tenant_repo.create_membership(
            user_id=user.id,
            tenant_id=sandbox_tenant.id,
            role="trial_viewer",
            status="active",
        )
        await write_audit_event(
            session,
            tenant_id=sandbox_tenant.id,
            actor_user_id=user.id,
            action="auth.signup_trial",
            resource_type="user",
            resource_id=user.id,
            details={"email": normalized_email, "role": "trial_viewer"},
        )
        await session.commit()
        return SignUpResponse(
            status="success",
            requires_approval=False,
            message="Your evaluation account is ready. You can sign in immediately.",
            user_id=user.id,
            tenant_id=sandbox_tenant.id,
            role="trial_viewer",
        )

    # 2. VIEWER or EDITOR: Must choose an existing workspace, requires admin approval
    if payload.role in ("viewer", "editor"):
        if not payload.tenant_id:
            raise ValidationError(
                "Please select an existing workspace from the dropdown.",
                code="workspace_required",
            )
        target_tenant = await tenant_repo.get_by_id(payload.tenant_id)
        if target_tenant is None or not target_tenant.is_active or target_tenant.status != "active":
            raise NotFoundError("The selected workspace does not exist or is inactive.")

        existing_membership = await tenant_repo.get_membership(
            tenant_id=target_tenant.id,
            user_id=user.id,
        )
        if existing_membership is not None:
            if existing_membership.status == "pending_approval":
                return SignUpResponse(
                    status="pending",
                    requires_approval=True,
                    message="You already have a pending registration request for this workspace. Please wait for an administrator to approve it.",
                    user_id=user.id,
                    tenant_id=target_tenant.id,
                    role=existing_membership.role,
                )
            raise ValidationError("You are already a member of this workspace.", code="already_member")

        membership = await tenant_repo.create_membership(
            user_id=user.id,
            tenant_id=target_tenant.id,
            role=payload.role,
            status="pending_approval",
        )
        await write_audit_event(
            session,
            tenant_id=target_tenant.id,
            actor_user_id=user.id,
            action="auth.signup_pending",
            resource_type="membership",
            resource_id=membership.id,
            details={"role": payload.role, "tenant_name": target_tenant.name},
        )
        await session.commit()
        return SignUpResponse(
            status="success",
            requires_approval=True,
            message="Your account registration is complete. A workspace administrator must approve your request before you can sign in.",
            user_id=user.id,
            tenant_id=target_tenant.id,
            role=payload.role,
        )

    # 3. ADMIN: Option A (Existing workspace) or Option B (New workspace proposal)
    if payload.role == "admin":
        if payload.new_tenant_name and payload.new_tenant_name.strip():
            raw_name = payload.new_tenant_name.strip()
            base_slug = _slugify(raw_name)
            slug = base_slug
            existing_slug = await tenant_repo.get_by_slug(slug)
            if existing_slug is not None:
                slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

            new_tenant = await tenant_repo.create_tenant(
                name=raw_name,
                slug=slug,
                settings={},
                status="pending",  # Pending superadmin approval
            )
            membership = await tenant_repo.create_membership(
                user_id=user.id,
                tenant_id=new_tenant.id,
                role="admin",
                status="pending_approval",
            )
            await write_audit_event(
                session,
                tenant_id=new_tenant.id,
                actor_user_id=user.id,
                action="auth.signup_new_tenant_proposed",
                resource_type="tenant",
                resource_id=new_tenant.id,
                details={"name": raw_name, "slug": slug},
            )
            await session.commit()
            return SignUpResponse(
                status="success",
                requires_approval=True,
                message="Workspace creation request submitted. A platform superadmin must approve the workspace and your administrator account before you can sign in.",
                user_id=user.id,
                tenant_id=new_tenant.id,
                role="admin",
            )
        elif payload.tenant_id:
            target_tenant = await tenant_repo.get_by_id(payload.tenant_id)
            if target_tenant is None or not target_tenant.is_active:
                raise NotFoundError("The selected workspace does not exist.")

            existing_membership = await tenant_repo.get_membership(
                tenant_id=target_tenant.id,
                user_id=user.id,
            )
            if existing_membership is not None:
                raise ValidationError("You are already associated with this workspace.", code="already_member")

            membership = await tenant_repo.create_membership(
                user_id=user.id,
                tenant_id=target_tenant.id,
                role="admin",
                status="pending_approval",
            )
            await write_audit_event(
                session,
                tenant_id=target_tenant.id,
                actor_user_id=user.id,
                action="auth.signup_admin_pending",
                resource_type="membership",
                resource_id=membership.id,
                details={"role": "admin", "tenant_name": target_tenant.name},
            )
            await session.commit()
            return SignUpResponse(
                status="success",
                requires_approval=True,
                message="Administrator registration submitted. Existing workspace administrators or a platform superadmin must approve your access before you can sign in.",
                user_id=user.id,
                tenant_id=target_tenant.id,
                role="admin",
            )
        else:
            raise ValidationError(
                "Please select an existing workspace or specify a new workspace name to proceed.",
                code="missing_workspace_choice",
            )

    raise ValidationError("Invalid role specified.", code="invalid_role")


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
            raise ForbiddenError("User does not belong to the specified workspace.")

        if membership.status == "pending_approval":
            raise ForbiddenError(
                "Your account is awaiting approval from your workspace administrator. You will be able to sign in once approved.",
                code="membership_pending_approval",
            )

        tenant = await tenant_repo.get_by_id(membership.tenant_id)
        if tenant and tenant.status == "pending":
            raise ForbiddenError(
                "This workspace is awaiting approval by a platform superadmin.",
                code="tenant_pending_approval",
            )
    else:
        all_memberships = await tenant_repo.list_user_memberships(user.id)
        if not all_memberships:
            raise ForbiddenError("User has no workspace memberships.")

        # Prioritize active memberships
        active_memberships = [m for m in all_memberships if m.status == "active"]
        if not active_memberships:
            pending = [m for m in all_memberships if m.status == "pending_approval"]
            if pending:
                raise ForbiddenError(
                    "Your account is awaiting approval from your workspace administrator. You will be able to sign in once approved.",
                    code="membership_pending_approval",
                )
            raise ForbiddenError("User has no active workspace memberships.")

        membership = active_memberships[0]
        tenant = await tenant_repo.get_by_id(membership.tenant_id)
        if tenant and tenant.status == "pending":
            raise ForbiddenError(
                "This workspace is awaiting approval by a platform superadmin.",
                code="tenant_pending_approval",
            )

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
    if membership is None or membership.status != "active":
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
