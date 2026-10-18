import json
import logging

from app.config import (
    HYBRID_CANDIDATE_LIMIT,
    MAX_PARENT_CONTEXTS_PER_ANSWER,
    RECURSIVE_CHILD_MAX_TOKENS,
    RECURSIVE_CHILD_MIN_TOKENS,
    RECURSIVE_CHILD_OVERLAP_TOKENS,
    RECURSIVE_CHILD_TARGET_TOKENS,
    RECURSIVE_PARENT_MAX_TOKENS,
    RECURSIVE_PARENT_MIN_TOKENS,
    RECURSIVE_PARENT_TARGET_TOKENS,
    RERANKED_CHILD_LIMIT,
    SEMANTIC_SECTION_TOKEN_THRESHOLD,
    get_settings,
)
from app.observability.logging import (
    StructuredJsonFormatter,
    configure_logging,
    request_id_ctx,
    tenant_id_ctx,
    user_id_ctx,
)
from app.observability.metrics import (
    record_request_latency,
    record_retrieval_latency,
    render_prometheus_metrics,
)
from app.observability.tracing import trace_chat, trace_ingestion


def test_approved_chunking_defaults() -> None:
    """Verify exact chunking defaults from ARCHITECTURE.md Section 5.1."""
    assert RECURSIVE_PARENT_TARGET_TOKENS == 1200
    assert RECURSIVE_PARENT_MIN_TOKENS == 1000
    assert RECURSIVE_PARENT_MAX_TOKENS == 1400
    assert RECURSIVE_CHILD_TARGET_TOKENS == 350
    assert RECURSIVE_CHILD_MIN_TOKENS == 300
    assert RECURSIVE_CHILD_MAX_TOKENS == 400
    assert RECURSIVE_CHILD_OVERLAP_TOKENS == 50
    assert SEMANTIC_SECTION_TOKEN_THRESHOLD == 2500
    assert MAX_PARENT_CONTEXTS_PER_ANSWER == 3
    assert HYBRID_CANDIDATE_LIMIT == 60
    assert RERANKED_CHILD_LIMIT == 8

    settings = get_settings()
    assert settings.EMBEDDING_MODEL_NAME == "BAAI/bge-m3"
    assert settings.EMBEDDING_DIMENSIONS == 1024
    assert settings.RERANKER_MODEL_NAME == "BAAI/bge-reranker-v2-m3"
    assert settings.QDRANT_COLLECTION_NAME == "chunks"
    assert settings.MINIO_BUCKET_NAME == "rag-documents"
    assert settings.DATABASE_URL.startswith("postgresql+asyncpg://")


def test_structured_logging_formatter() -> None:
    configure_logging("INFO")
    token_req = request_id_ctx.set("req-123")
    token_ten = tenant_id_ctx.set("tenant-456")
    token_usr = user_id_ctx.set("user-789")
    try:
        formatter = StructuredJsonFormatter()
        record = logging.LogRecord(
            name="rag.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="test structured log",
            args=(),
            exc_info=None,
        )
        formatted = formatter.format(record)
        parsed = json.loads(formatted)
        assert parsed["message"] == "test structured log"
        assert parsed["request_id"] == "req-123"
        assert parsed["tenant_id"] == "tenant-456"
        assert parsed["user_id"] == "user-789"
    finally:
        request_id_ctx.reset(token_req)
        tenant_id_ctx.reset(token_ten)
        user_id_ctx.reset(token_usr)


def test_metrics_recording() -> None:
    record_request_latency("GET", "/health", 0.012, status_code=200)
    record_retrieval_latency("tenant-456", "hybrid_search", 0.045)
    payload, content_type = render_prometheus_metrics()
    text = payload.decode("utf-8")
    assert "rag_http_requests_total" in text
    assert "rag_retrieval_duration_seconds" in text
    assert "text/plain" in content_type


async def test_tracing_decorators_passthrough_when_disabled() -> None:
    @trace_ingestion("test_ingest")
    async def sample_ingest(x: int) -> int:
        return x + 1

    @trace_chat("test_chat")
    async def sample_chat(q: str) -> str:
        return f"ans:{q}"

    assert await sample_ingest(4) == 5
    assert await sample_chat("hello") == "ans:hello"