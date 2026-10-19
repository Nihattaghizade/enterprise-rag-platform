import uuid
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


class ErrorResponse(BaseModel):
    """Section 10: Standard API error shape."""

    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)
    tenant_id: Optional[uuid.UUID] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: Optional[str] = None
    tenant_id: Optional[uuid.UUID] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    role: str


class LogoutResponse(BaseModel):
    status: str = "logged_out"