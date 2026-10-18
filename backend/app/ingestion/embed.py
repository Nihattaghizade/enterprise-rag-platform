import asyncio
import hashlib
import json
import math
import re
import zlib
from collections import Counter
from typing import Any, Optional

import httpx
from redis.asyncio import Redis

from app.config import get_settings
from app.core.rate_limit import get_redis_client

_bge_m3_model: Any = None


def _get_local_bge_m3_model() -> Any:
    """Lazy-load BAAI/bge-m3 via sentence-transformers once per process."""
    global _bge_m3_model
    if _bge_m3_model is None:
        from sentence_transformers import SentenceTransformer

        settings = get_settings()
        _bge_m3_model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
    return _bge_m3_model


def build_embedding_cache_key(embedding_model: str, normalized_text: str) -> str:
    """Section 5.4C: rag:{env}:cache:embedding:{embedding_model}:{content_sha256}"""
    settings = get_settings()
    safe_model = embedding_model.replace("/", "_").replace(":", "_")
    content_hash = hashlib.sha256(
        f"{embedding_model}::{normalized_text}".encode("utf-8")
    ).hexdigest()
    return f"rag:{settings.ENVIRONMENT}:cache:embedding:{safe_model}:{content_hash}"


def _compute_sparse_vector(text: str) -> dict[str, list[Any]]:
    """Compute BM25-style sparse vector representation (Section 2 & 5.4B)."""
    tokens = re.findall(r"\w+", text.lower())
    if not tokens:
        return {"indices": [0], "values": [0.0]}
    counts = Counter(tokens)
    index_weights: dict[int, float] = {}
    for token, freq in counts.items():
        idx = zlib.crc32(token.encode("utf-8")) % 100_000
        tf_weight = round(1.0 + math.log(freq), 4)
        index_weights[idx] = max(index_weights.get(idx, 0.0), tf_weight)
    sorted_items = sorted(index_weights.items(), key=lambda item: item[0])
    return {
        "indices": [k for k, _ in sorted_items],
        "values": [v for _, v in sorted_items],
    }


def _encode_batch_sync(texts: list[str]) -> list[list[float]]:
    """Run BAAI/bge-m3 batch encoding synchronously inside a worker thread."""
    model = _get_local_bge_m3_model()
    embeddings = model.encode(
        texts,
        batch_size=16,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return [vec.tolist() for vec in embeddings]


async def _generate_vector_bundles_batch(texts: list[str]) -> list[dict[str, Any]]:
    """Generate 1024-d BAAI/bge-m3 dense vectors + sparse vectors in batch without blocking the event loop."""
    settings = get_settings()
    sparse_list = [_compute_sparse_vector(t) for t in texts]

    # 1. Try self-hosted embedding-service container first (Section 14)
    if settings.EMBEDDING_SERVICE_URL:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{settings.EMBEDDING_SERVICE_URL.rstrip('/')}/embed",
                    json={"inputs": texts},
                )
                if resp.status_code == 200:
                    dense_batch = resp.json()
                    if isinstance(dense_batch, list) and len(dense_batch) == len(texts):
                        return [
                            {"dense": dense_batch[i], "sparse": sparse_list[i]}
                            for i in range(len(texts))
                        ]
        except Exception:
            pass

    # 2. Run local BAAI/bge-m3 model in a thread pool (Guardrail #10: non-blocking async I/O + batched inference)
    dense_batch = await asyncio.to_thread(_encode_batch_sync, texts)
    return [
        {"dense": dense_batch[i], "sparse": sparse_list[i]}
        for i in range(len(texts))
    ]


async def get_or_create_embedding(
    text: str,
    redis_client: Optional[Redis] = None,
) -> dict[str, Any]:
    """Section 6.1: Fetch single embedding from Redis content-hash cache or compute via BAAI/bge-m3."""
    results = await embed_texts([text], redis_client=redis_client)
    return results[0]


async def embed_texts(
    texts: list[str],
    redis_client: Optional[Redis] = None,
) -> list[dict[str, Any]]:
    """Section 6.1: Batch embeddings with Redis content-hash cache."""
    if not texts:
        return []

    settings = get_settings()
    owns_client = redis_client is None
    client = redis_client or get_redis_client()

    try:
        cache_keys = [
            build_embedding_cache_key(settings.EMBEDDING_MODEL_NAME, t) for t in texts
        ]
        cached_values = await client.mget(cache_keys)

        results: list[Optional[dict[str, Any]]] = [None] * len(texts)
        missing_indices: list[int] = []
        missing_texts: list[str] = []

        for idx, raw_cached in enumerate(cached_values):
            if raw_cached is not None:
                results[idx] = json.loads(raw_cached)
            else:
                missing_indices.append(idx)
                missing_texts.append(texts[idx])

        if missing_texts:
            computed_bundles = await _generate_vector_bundles_batch(missing_texts)
            async with client.pipeline(transaction=False) as pipe:
                for offset, bundle in enumerate(computed_bundles):
                    orig_idx = missing_indices[offset]
                    results[orig_idx] = bundle
                    pipe.set(
                        cache_keys[orig_idx],
                        json.dumps(bundle),
                        ex=settings.EMBEDDING_CACHE_TTL_SECONDS,
                    )
                await pipe.execute()

        return [r for r in results if r is not None]
    finally:
        if owns_client:
            await client.aclose()