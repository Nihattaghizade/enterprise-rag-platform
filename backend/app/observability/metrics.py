from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest

REGISTRY = CollectorRegistry(auto_describe=True)

REQUEST_COUNT = Counter(
    "rag_http_requests_total",
    "Total HTTP requests processed",
    ["method", "route", "status_code"],
    registry=REGISTRY,
)

REQUEST_LATENCY_SECONDS = Histogram(
    "rag_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "route"],
    registry=REGISTRY,
)

RETRIEVAL_LATENCY_SECONDS = Histogram(
    "rag_retrieval_duration_seconds",
    "Retrieval and reranking latency in seconds",
    ["tenant_id", "stage"],
    registry=REGISTRY,
)


def record_request_latency(
    method: str,
    route: str,
    latency_seconds: float,
    status_code: int = 200,
) -> None:
    """Record HTTP request count and duration histogram."""
    REQUEST_COUNT.labels(method=method, route=route, status_code=str(status_code)).inc()
    REQUEST_LATENCY_SECONDS.labels(method=method, route=route).observe(max(0.0, latency_seconds))


def record_retrieval_latency(
    tenant_id: str,
    stage: str,
    latency_seconds: float,
) -> None:
    """Record retrieval/reranking stage duration histogram scoped by tenant_id."""
    RETRIEVAL_LATENCY_SECONDS.labels(tenant_id=str(tenant_id), stage=stage).observe(
        max(0.0, latency_seconds)
    )


def render_prometheus_metrics() -> tuple[bytes, str]:
    """Serialize Prometheus metrics payload and content type for /metrics."""
    return generate_latest(REGISTRY), CONTENT_TYPE_LATEST