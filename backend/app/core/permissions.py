import uuid
from collections.abc import Sequence
from typing import Optional

from app.core.errors import ForbiddenError, ValidationError
from app.db.models import Membership, Tenant

VALID_ROLES = ("admin", "editor", "viewer")

ROLE_HIERARCHY: dict[str, int] = {
    "viewer": 1,
    "editor": 2,
    "admin": 3,
}


def validate_role(role: str) -> str:
    """Ensure a role string is one of the approved RBAC roles."""
    normalized = role.strip().lower()
    if normalized not in VALID_ROLES:
        raise ValidationError(
            f"Invalid role '{role}'. Must be one of: {', '.join(VALID_ROLES)}.",
            code="invalid_role",
        )
    return normalized


def require_role(
    membership: Optional[Membership],
    allowed_roles: Sequence[str],
) -> Membership:
    """Verify the authenticated membership has one of the allowed roles."""
    if membership is None:
        raise ForbiddenError(
            "No active tenant membership found for user.",
            code="membership_required",
        )
    normalized_allowed = {r.strip().lower() for r in allowed_roles}
    if membership.role.lower() not in normalized_allowed:
        raise ForbiddenError(
            f"Role '{membership.role}' is not authorized for this operation.",
            code="insufficient_role",
            details={"required_roles": sorted(normalized_allowed), "actual_role": membership.role},
        )
    return membership


def assert_tenant_access(
    membership: Optional[Membership],
    target_tenant_id: uuid.UUID,
    tenant: Optional[Tenant] = None,
) -> uuid.UUID:
    """Enforce the non-negotiable isolation rule: server-derived membership must match target_tenant_id."""
    if membership is None:
        raise ForbiddenError(
            "Tenant membership is required.",
            code="tenant_access_denied",
        )
    if membership.tenant_id != target_tenant_id:
        raise ForbiddenError(
            "Cross-tenant access is forbidden.",
            code="cross_tenant_access_denied",
        )
    if tenant is not None and not tenant.is_active:
        raise ForbiddenError(
            "Tenant is inactive.",
            code="tenant_inactive",
        )
    return membership.tenant_id