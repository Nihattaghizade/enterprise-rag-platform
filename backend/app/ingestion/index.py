import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qmodels

from app.config import get_settings
from app.db.models import Document
from app.ingestion.types import RetrievalChunkData

logger = logging.getLogger(__name__)

# Strict 3 MB max batch size for Qdrant payload inserts
MAX_QDRANT_BATCH_BYTES = 3 * 1024 * 1024  # 3 MB (3,145,728 bytes)


def estimate_point_bytes(point: qmodels.PointStruct) -> int:
    """Estimate serialized JSON byte size of a point for Qdrant batching."""
    vec = point.vector
    dense_size = len(vec.get("dense", [])) * 14 if isinstance(vec, dict) else 14336
    sparse = vec.get("sparse") if isinstance(vec, dict) else None
    sparse_size = 0
    if sparse is not None:
        if isinstance(sparse, qmodels.SparseVector):
            sparse_size = (len(sparse.indices) + len(sparse.values)) * 14
        elif isinstance(sparse, dict):
            sparse_size = (len(sparse.get("indices", [])) + len(sparse.get("values", []))) * 14
    payload = point.payload or {}
    text_size = len(str(payload.get("chunk_text", "")).encode("utf-8", errors="replace"))
    overhead = 1024  # metadata, UUIDs, structure brackets
    return dense_size + sparse_size + text_size + overhead


def split_points_into_batches(
    points: Sequence[qmodels.PointStruct],
    max_batch_bytes: int = MAX_QDRANT_BATCH_BYTES,
) -> list[list[qmodels.PointStruct]]:
    """Partition points into batches where each batch does not exceed max_batch_bytes (3 MB)."""
    batches: list[list[qmodels.PointStruct]] = []
    current_batch: list[qmodels.PointStruct] = []
    current_bytes = 0

    for pt in points:
        pt_bytes = estimate_point_bytes(pt)
        if current_batch and (current_bytes + pt_bytes > max_batch_bytes):
            batches.append(current_batch)
            current_batch = [pt]
            current_bytes = pt_bytes
        else:
            current_batch.append(pt)
            current_bytes += pt_bytes

    if current_batch:
        batches.append(current_batch)

    return batches


def get_qdrant_client() -> AsyncQdrantClient:
    """Create an AsyncQdrantClient configured from Settings."""
    settings = get_settings()
    api_key = settings.QDRANT_API_KEY or None
    return AsyncQdrantClient(url=settings.QDRANT_URL, api_key=api_key)


async def ensure_chunks_collection(
    client: Optional[AsyncQdrantClient] = None,
) -> str:
    """Ensure Qdrant 'chunks' collection and required payload indexes exist per Section 5.4B."""
    settings = get_settings()
    collection_name = settings.QDRANT_COLLECTION_NAME
    owns_client = client is None
    qclient = client or get_qdrant_client()

    try:
        exists = await qclient.collection_exists(collection_name)
        if not exists:
            await qclient.create_collection(
                collection_name=collection_name,
                vectors_config={
                    "dense": qmodels.VectorParams(
                        size=settings.EMBEDDING_DIMENSIONS,
                        distance=qmodels.Distance.COSINE,
                        hnsw_config=qmodels.HnswConfigDiff(
                            m=settings.QDRANT_HNSW_M,
                            ef_construct=settings.QDRANT_HNSW_EF_CONSTRUCT,
                        ),
                    )
                },
                sparse_vectors_config={
                    "sparse": qmodels.SparseVectorParams(),
                },
            )

            # Create required payload indexes per Section 5.4B (line 480)
            keyword_fields = ["tenant_id", "doc_id", "parent_id", "strategy", "section_number"]
            for field_name in keyword_fields:
                await qclient.create_payload_index(
                    collection_name=collection_name,
                    field_name=field_name,
                    field_schema=qmodels.PayloadSchemaType.KEYWORD,
                )
            await qclient.create_payload_index(
                collection_name=collection_name,
                field_name="is_active",
                field_schema=qmodels.PayloadSchemaType.BOOL,
            )
            await qclient.create_payload_index(
                collection_name=collection_name,
                field_name="document_version",
                field_schema=qmodels.PayloadSchemaType.INTEGER,
            )

        return collection_name
    finally:
        if owns_client:
            await qclient.close()


async def upsert_retrieval_chunks(
    document: Document,
    children: Sequence[RetrievalChunkData],
    parent_ids: Sequence[uuid.UUID],
    vectors: Sequence[dict[str, Any]],
    *,
    client: Optional[AsyncQdrantClient] = None,
) -> int:
    """Section 6.1 & 5.4B: Batch upsert dense+sparse child retrieval chunk points to Qdrant."""
    if not children:
        return 0

    settings = get_settings()
    collection_name = settings.QDRANT_COLLECTION_NAME
    owns_client = client is None
    qclient = client or get_qdrant_client()

    try:
        await ensure_chunks_collection(qclient)
        now_iso = datetime.now(timezone.utc).isoformat()
        points: list[qmodels.PointStruct] = []

        for idx, chunk in enumerate(children):
            vec_bundle = vectors[idx]
            resolved_parent_id = (
                parent_ids[chunk.parent_index]
                if chunk.parent_index < len(parent_ids)
                else chunk.parent_id
            )
            sparse_data = vec_bundle["sparse"]

            payload: dict[str, Any] = {
                "tenant_id": str(document.tenant_id),
                "doc_id": str(document.id),
                "parent_id": str(resolved_parent_id),
                "chunk_id": str(chunk.chunk_id),
                "chunk_text": chunk.text,
                "section_number": chunk.section_number,
                "section_title": chunk.section_title,
                "chunk_index": chunk.chunk_index,
                "strategy": chunk.strategy,
                "document_version": document.version,
                "is_active": True,
                "language": document.language or "en",
                "tags": list(document.tags or []),
                "created_at": now_iso,
                "metadata": chunk.metadata or {},
            }

            points.append(
                qmodels.PointStruct(
                    id=str(chunk.chunk_id),
                    vector={
                        "dense": vec_bundle["dense"],
                        "sparse": qmodels.SparseVector(
                            indices=sparse_data["indices"],
                            values=sparse_data["values"],
                        ),
                    },
                    payload=payload,
                )
            )

        batches = split_points_into_batches(points, max_batch_bytes=MAX_QDRANT_BATCH_BYTES)
        logger.info(
            "Upserting %d points for document %s to collection '%s' across %d batch(es) (max 3 MB per batch)",
            len(points),
            document.id,
            collection_name,
            len(batches),
        )

        for batch_idx, batch in enumerate(batches, start=1):
            await qclient.upsert(
                collection_name=collection_name,
                points=batch,
                wait=True,
            )
            logger.debug(
                "Upserted batch %d/%d (%d points) for document %s",
                batch_idx,
                len(batches),
                len(batch),
                document.id,
            )

        return len(points)
    finally:
        if owns_client:
            await qclient.close()


async def delete_document_points(
    tenant_id: uuid.UUID,
    document_id: uuid.UUID,
    *,
    exclude_version: Optional[int] = None,
    client: Optional[AsyncQdrantClient] = None,
) -> None:
    """Section 5.4B & 6.1: Delete Qdrant points using mandatory filter tenant_id AND doc_id."""
    settings = get_settings()
    collection_name = settings.QDRANT_COLLECTION_NAME
    owns_client = client is None
    qclient = client or get_qdrant_client()

    try:
        exists = await qclient.collection_exists(collection_name)
        if not exists:
            return

        must_conditions: list[qmodels.Condition] = [
            qmodels.FieldCondition(
                key="tenant_id",
                match=qmodels.MatchValue(value=str(tenant_id)),
            ),
            qmodels.FieldCondition(
                key="doc_id",
                match=qmodels.MatchValue(value=str(document_id)),
            ),
        ]
        must_not_conditions: list[qmodels.Condition] = []
        if exclude_version is not None:
            must_not_conditions.append(
                qmodels.FieldCondition(
                    key="document_version",
                    match=qmodels.MatchValue(value=exclude_version),
                )
            )

        await qclient.delete(
            collection_name=collection_name,
            points_selector=qmodels.FilterSelector(
                filter=qmodels.Filter(
                    must=must_conditions,
                    must_not=must_not_conditions if must_not_conditions else None,
                )
            ),
            wait=True,
        )
    finally:
        if owns_client:
            await qclient.close()