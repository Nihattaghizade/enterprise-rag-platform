import time
import uuid
from typing import Any, Optional

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qmodels

from app.config import HYBRID_CANDIDATE_LIMIT, get_settings
from app.ingestion.embed import get_or_create_embedding
from app.ingestion.index import ensure_chunks_collection, get_qdrant_client
from app.observability.metrics import record_retrieval_latency
from app.retrieval.types import CandidateChunk


def build_mandatory_qdrant_filter(
    tenant_id: uuid.UUID,
    *,
    tags: Optional[list[str]] = None,
    doc_ids: Optional[list[uuid.UUID]] = None,
) -> qmodels.Filter:
    """Section 5.4B Required query filter: every Qdrant search must filter by server-derived tenant_id and is_active=true."""
    must_conditions: list[qmodels.Condition] = [
        qmodels.FieldCondition(
            key="tenant_id",
            match=qmodels.MatchValue(value=str(tenant_id)),
        ),
        qmodels.FieldCondition(
            key="is_active",
            match=qmodels.MatchValue(value=True),
        ),
    ]

    if tags:
        must_conditions.append(
            qmodels.FieldCondition(
                key="tags",
                match=qmodels.MatchAny(any=tags),
            )
        )

    if doc_ids:
        must_conditions.append(
            qmodels.FieldCondition(
                key="doc_id",
                match=qmodels.MatchAny(any=[str(d) for d in doc_ids]),
            )
        )

    return qmodels.Filter(must=must_conditions)


async def hybrid_search(
    tenant_id: uuid.UUID,
    query: str,
    *,
    limit: int = HYBRID_CANDIDATE_LIMIT,
    tags: Optional[list[str]] = None,
    doc_ids: Optional[list[uuid.UUID]] = None,
    query_vector_bundle: Optional[dict[str, Any]] = None,
    client: Optional[AsyncQdrantClient] = None,
) -> list[CandidateChunk]:
    """Section 7.1: Execute tenant-filtered dense + sparse Qdrant searches fused with RRF."""
    settings = get_settings()
    collection_name = settings.QDRANT_COLLECTION_NAME
    owns_client = client is None
    qclient = client or get_qdrant_client()

    start_time = time.perf_counter()
    try:
        await ensure_chunks_collection(qclient)
        vector_bundle = query_vector_bundle or await get_or_create_embedding(query)
        dense_vec: list[float] = vector_bundle["dense"]
        sparse_data: dict[str, list[Any]] = vector_bundle["sparse"]

        qfilter = build_mandatory_qdrant_filter(
            tenant_id=tenant_id,
            tags=tags,
            doc_ids=doc_ids,
        )

        response = await qclient.query_points(
            collection_name=collection_name,
            prefetch=[
                qmodels.Prefetch(
                    query=dense_vec,
                    using="dense",
                    filter=qfilter,
                    limit=limit,
                ),
                qmodels.Prefetch(
                    query=qmodels.SparseVector(
                        indices=sparse_data["indices"],
                        values=sparse_data["values"],
                    ),
                    using="sparse",
                    filter=qfilter,
                    limit=limit,
                ),
            ],
            query=qmodels.FusionQuery(fusion=qmodels.Fusion.RRF),
            query_filter=qfilter,
            limit=limit,
            with_payload=True,
        )

        candidates: list[CandidateChunk] = []
        for point in response.points:
            payload = point.payload or {}
            # Double-check server-side tenant match (Guardrail #1)
            if str(payload.get("tenant_id")) != str(tenant_id):
                continue
            if not payload.get("is_active", False):
                continue

            candidates.append(
                CandidateChunk(
                    chunk_id=uuid.UUID(str(payload["chunk_id"])),
                    doc_id=uuid.UUID(str(payload["doc_id"])),
                    parent_id=uuid.UUID(str(payload["parent_id"])),
                    tenant_id=uuid.UUID(str(payload["tenant_id"])),
                    chunk_text=str(payload.get("chunk_text", "")),
                    section_number=str(payload.get("section_number", "1")),
                    section_title=payload.get("section_title"),
                    chunk_index=int(payload.get("chunk_index", 0)),
                    strategy=str(payload.get("strategy", "recursive")),
                    document_version=int(payload.get("document_version", 1)),
                    rrf_score=float(point.score or 0.0),
                    language=payload.get("language"),
                    tags=list(payload.get("tags") or []),
                    metadata=dict(payload.get("metadata") or {}),
                )
            )

        return candidates
    finally:
        elapsed = time.perf_counter() - start_time
        record_retrieval_latency(str(tenant_id), "hybrid_search", elapsed)
        if owns_client:
            await qclient.close()