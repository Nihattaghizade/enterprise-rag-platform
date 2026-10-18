import uuid
from typing import Any, Optional

from app.observability.logging import request_id_ctx


class AppError(Exception):
    """Base domain exception mapped to the standard API error response."""

    status_code: int = 400
    default_code: str = "application_error"

    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        status_code: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code or self.default_code
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code

    def to_response_dict(self, request_id: Optional[str] = None) -> dict[str, Any]:
        """Serialize to the exact error contract required by ARCHITECTURE.md Section 10."""
        resolved_request_id = request_id or request_id_ctx.get() or str(uuid.uuid4())
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
            "request_id": resolved_request_id,
        }


class NotFoundError(AppError):
    """Resource not found (or inaccessible across tenants)."""

    status_code = 404
    default_code = "not_found"


class ForbiddenError(AppError):
    """Authenticated actor lacks role or tenant permission."""

    status_code = 403
    default_code = "forbidden"


class ValidationError(AppError):
    """Domain or input validation failed."""

    status_code = 422
    default_code = "validation_error"


class UnauthorizedError(AppError):
    """Authentication failed or token is invalid/expired."""

    status_code = 401
    default_code = "unauthorized"


class RateLimitExceededError(AppError):
    """Per-user, per-tenant, or upload rate limit exceeded."""

    status_code = 429
    default_code = "rate_limit_exceeded"