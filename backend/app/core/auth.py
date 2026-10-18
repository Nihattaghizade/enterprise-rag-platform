import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import UnauthorizedError
from app.core.security import generate_token_id, verify_password
from app.db.models import User
from app.db.repositories.users import UserRepository


async def authenticate_user(
    session: AsyncSession,
    email: str,
    password: str,
) -> User:
    """Authenticate a user by email and password, returning the active User entity."""
    repo = UserRepository(session)
    user = await repo.get_by_email(email)
    if user is None or not user.is_active:
        raise UnauthorizedError("Invalid email or password.")
    if not verify_password(password, user.password_hash):
        raise UnauthorizedError("Invalid email or password.")
    return user


def create_access_token(
    user_id: uuid.UUID,
    tenant_id: Optional[uuid.UUID] = None,
    role: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Issue a signed JWT access token."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "access",
        "jti": generate_token_id(),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if tenant_id is not None:
        payload["tenant_id"] = str(tenant_id)
    if role is not None:
        payload["role"] = role
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    user_id: uuid.UUID,
    tenant_id: Optional[uuid.UUID] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Issue a signed JWT refresh token."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": generate_token_id(),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if tenant_id is not None:
        payload["tenant_id"] = str(tenant_id)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(
    token: str,
    expected_type: Optional[str] = None,
) -> dict[str, Any]:
    """Decode and validate a JWT token, optionally verifying token type."""
    settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Token has expired.", code="token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid authentication token.", code="invalid_token") from exc

    if expected_type is not None and payload.get("type") != expected_type:
        raise UnauthorizedError(
            f"Expected '{expected_type}' token.",
            code="invalid_token_type",
        )
    return payload