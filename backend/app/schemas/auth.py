import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class WorkspaceOption(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters.")
    role: str = Field(..., pattern="^(trial_viewer|viewer|editor|admin)$")
    tenant_id: Optional[uuid.UUID] = None
    new_tenant_name: Optional[str] = Field(None, max_length=100)


class SignUpResponse(BaseModel):
    status: str
    requires_approval: bool
    message: str
    user_id: uuid.UUID
    tenant_id: Optional[uuid.UUID] = None
    role: str
