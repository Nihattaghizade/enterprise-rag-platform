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


ROLE_HIERARCHY = {
    "superadmin": 100,
    "admin": 30,
    "editor": 20,
    "viewer": 10,
    "trial_viewer": 5,
}


def require_role(membership: Membership, allowed_roles: Sequence[str]) -> None:
    current_role = membership.role.strip().lower()
    # Superadmin has universal access across all workspaces
    if current_role == "superadmin":
        return

    allowed = {r.strip().lower() for r in allowed_roles}
    if current_role in allowed:
        return

    # Check hierarchical RBAC: if user's role level >= minimum level required by allowed_roles
    current_level = ROLE_HIERARCHY.get(current_role, 0)
    min_required_level = min((ROLE_HIERARCHY.get(r, 999) for r in allowed), default=999)
    if current_level >= min_required_level:
        return

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
