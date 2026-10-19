from fastapi import APIRouter, Depends, Response
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, require_roles
from app.core.rate_limit import get_redis_client
from app.db.session import get_db_session
from app.ingestion.index import get_qdrant_client
from app.observability.metrics import render_prometheus_metrics

router = APIRouter(tags=["health"])


@router.get("/health")
async def liveness_check() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}


@router.get("/ready")
async def readiness_check(
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Readiness probe checking PostgreSQL, Redis, and Qdrant connectivity."""
    await session.execute(sql_text("SELECT 1"))

    redis_client = get_redis_client()
    try:
        await redis_client.ping()
    finally:
        await redis_client.aclose()

    qclient = get_qdrant_client()
    try:
        await qclient.get_collections()
    finally:
        await qclient.close()

    return {"status": "ready"}


@router.get("/metrics")
async def metrics_endpoint(
    _ctx: AuthContext = Depends(require_roles("admin")),
) -> Response:
    """Protected Prometheus metrics endpoint (requires admin role per Section 5.2)."""
    payload, content_type = render_prometheus_metrics()
    return Response(content=payload, media_type=content_type)