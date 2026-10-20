import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TenantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100)
    settings: dict[str, Any] = Field(default_factory=dict)


class TenantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    status: str = "active"
    settings: dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MemberAddRequest(BaseModel):
    email: EmailStr
    role: str = Field(..., pattern="^(admin|editor|viewer)$")
    password: Optional[str] = None


class MemberRoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|editor|viewer)$")


class MembershipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    role: str
    status: str = "active"
    email: Optional[str] = None
    tenant_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PendingApprovalResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    role: str
    tenant_id: uuid.UUID
    tenant_name: str
    status: str
    created_at: datetime


class TrialStatusResponse(BaseModel):
    is_trial: bool
    documents_uploaded: int = 0
    max_documents: int = 2
    questions_asked: int = 0
    max_questions: int = 10


class SuperadminOverviewResponse(BaseModel):
    total_tenants: int
    active_tenants: int
    pending_tenants: int
    total_users: int
    pending_approvals: int
    total_documents: int
    total_queries: int
