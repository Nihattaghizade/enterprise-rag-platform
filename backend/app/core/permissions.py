from typing import Sequence

from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.db.models import Membership

VALID_ROLES = {"admin", "editor", "viewer"}


def validate_role(role: str) -> str:
    cleaned = role.strip().lower()
    if cleaned not in VALID_ROLES:
        raise ValidationError(
            f"Invalid role '{role}'. Allowed roles: {sorted(VALID_ROLES)}",
            code="invalid_role",
        )
    return cleaned


def require_role(membership: Membership, allowed_roles: Sequence[str]) -> None:
    current_role = membership.role.strip().lower()
    # Superadmin has universal access across all workspaces
    if current_role == "superadmin":
        return

    allowed = {r.strip().lower() for r in allowed_roles}
    if current_role not in allowed:
        raise ForbiddenError(
            f"Role '{membership.role}' does not have sufficient permissions. Required one of: {sorted(allowed)}",
            code="insufficient_permissions",
        )


def assert_tenant_access(membership: Membership, tenant_id: object) -> object:
    # Superadmin has universal cross-tenant access
    if membership.role.strip().lower() == "superadmin":
        return tenant_id

    if str(membership.tenant_id) != str(tenant_id):
        raise ForbiddenError("Cross-tenant access is forbidden.", code="cross_tenant_access_denied")
    return membership.tenant_id
