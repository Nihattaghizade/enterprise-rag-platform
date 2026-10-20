import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, chat, documents, health, superadmin, tenants
from app.config import get_settings
from app.core.errors import AppError
from app.db.session import create_engine
from app.ingestion.index import ensure_chunks_collection
from app.observability.logging import configure_logging, request_id_ctx
from app.observability.metrics import record_request_latency
from app.observability.tracing import configure_langsmith
from app.storage.minio_client import ensure_bucket


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Section 5.1: Initialize logging, LangSmith, DB engine, MinIO bucket, and Qdrant collection on startup."""
    configure_logging()
    configure_langsmith()
    engine = create_engine()
    try:
        await ensure_bucket()
        await ensure_chunks_collection()
    except Exception:
        pass
    yield
    await engine.dispose()


def register_routers(app: FastAPI) -> None:
    """Section 5.1: Register all API routers on the FastAPI application."""
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(documents.router)
    app.include_router(chat.router)
    app.include_router(tenants.router)
    app.include_router(superadmin.router)


def create_app() -> FastAPI:
    """Section 5.1: Build the FastAPI app, configure CORS/middleware, lifespan, and global exception handling."""
    settings = get_settings()
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context_and_metrics_middleware(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_ctx.set(req_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            elapsed = time.perf_counter() - start
            record_request_latency(
                method=request.method,
                route=request.url.path,
                latency_seconds=elapsed,
                status_code=response.status_code,
            )
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            request_id_ctx.reset(token)

    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_response_dict(),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        req_id = request_id_ctx.get() or str(uuid.uuid4())
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "code": "validation_error",
                "message": "Request validation failed.",
                "details": {"errors": exc.errors()},
                "request_id": req_id,
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, _exc: Exception) -> JSONResponse:
        req_id = request_id_ctx.get() or str(uuid.uuid4())
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "code": "internal_server_error",
                "message": "An unexpected internal error occurred.",
                "details": {},
                "request_id": req_id,
            },
        )

    register_routers(app)
    return app


app = create_app()
