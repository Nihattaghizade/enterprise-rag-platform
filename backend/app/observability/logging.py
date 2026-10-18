import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.config import get_settings

request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
tenant_id_ctx: ContextVar[Optional[str]] = ContextVar("tenant_id", default=None)
user_id_ctx: ContextVar[Optional[str]] = ContextVar("user_id", default=None)


class StructuredJsonFormatter(logging.Formatter):
    """Format log records as single-line JSON including request/tenant/user context."""

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None) or request_id_ctx.get(),
            "tenant_id": getattr(record, "tenant_id", None) or tenant_id_ctx.get(),
            "user_id": getattr(record, "user_id", None) or user_id_ctx.get(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(log_level: Optional[str] = None) -> logging.Logger:
    """Configure root logger for structured JSON output."""
    settings = get_settings()
    resolved_level = (log_level or settings.LOG_LEVEL).upper()

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, resolved_level, logging.INFO))

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredJsonFormatter())

    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    return root_logger