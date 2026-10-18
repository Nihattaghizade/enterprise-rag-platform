import asyncio
import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

import httpx
from redis.asyncio import Redis

from app.config import RERANKED_CHILD_LIMIT, get_settings
from app.core.rate_limit import get_redis_client
from app.observability.metrics import record_retrieval_latency
from app.retrieval.types import CandidateChunk, RerankedChunk

_bge_reranker_model: Any = None


def _get_local_bge_reranker() -> Any:
    """Lazy-load BAAI/bge-reranker-v2-m3 CrossEncoder once per process."""
    global _bge_reranker_model
    if _bge_reranker_model is None:
        from sentence_transformers import CrossEncoder

        settings = get_settings()
        _bge_reranker_model = CrossEncoder(settings.RERANKER_MODEL_NAME)
    return _bge_reranker_model


def build_rerank_cache_key(
    reranker_model: str,
    query: str,
    chunk_id: uuid.UUID | str,
) -> str:
    """Section 5.4C: rag:{env}:cache:rerank:{reranker_model}:{query_hash}:{chunk_id}"""
    settings = get_settings()
    safe_model = reranker_model.replace("/", "_").replace(":", "_")
    query_hash = hashlib.sha256(query.strip().lower().encode("utf-8")).hexdigest()
    return f"rag:{settings.ENVIRONMENT}:cache:rerank:{safe_model}:{query_hash}:{chunk_id}"


def _score_pairs_sync(pairs: list[tuple[str, str]]) -> list[float]:
    """Run BAAI/bge-reranker-v2-m3 batch scoring synchronously in a worker thread."""
    reranker = _get_local_bge_reranker()
    scores = reranker.predict(pairs, batch_size=16, show_progress_bar=False)
    return [float(s) for s in scores]


async def _score_candidates_batch(
    query: str,
    texts: list[str],
) -> list[float]:
    """Call self-hosted reranker-service container or local BAAI/bge-reranker-v2-m3 CrossEncoder."""
    settings = get_settings()
    if settings.RERANKER_SERVICE_URL:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{settings.RERANKER_SERVICE_URL.rstrip('/')}/rerank",
                    json={"query": query, "texts": texts},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and len(data) == len(texts):
                        score_map = {int(item["index"]): float(item["score"]) for item in data}
                        return [score_map[i] for i in range(len(texts))]
        except Exception:
            pass

    pairs = [(query, text) for text in texts]
    return await asyncio.to_thread(_score_pairs_sync, pairs)


async def rerank_candidates(
    query: str,
    candidates: Sequence[CandidateChunk],
    *,
    top_k: int = RERANKED_CHILD_LIMIT,
    redis_client: Optional[Redis] = None,
) -> list[RerankedChunk]:
    """Section 7.1: Batch call BAAI/bge-reranker-v2-m3, score candidates, and retain top 8."""
    if not candidates:
        return []

    settings = get_settings()
    tenant_id = str(candidates[0].tenant_id)
    owns_client = redis_client is None
    client = redis_client or get_redis_client()
    start_time = time.perf_counter()

    try:
        cache_keys = [
            build_rerank_cache_key(settings.RERANKER_MODEL_NAME, query, c.chunk_id)
            for c in candidates
        ]
        cached_raw = await client.mget(cache_keys)

        scores: list[Optional[float]] = [None] * len(candidates)
        missing_indices: list[int] = []
        missing_texts: list[str] = []

        for idx, raw_val in enumerate(cached_raw):
            if raw_val is not None:
                parsed = json.loads(raw_val)
                scores[idx] = float(parsed["score"])
            else:
                missing_indices.append(idx)
                missing_texts.append(candidates[idx].chunk_text)

        if missing_texts:
            computed_scores = await _score_candidates_batch(query, missing_texts)
            now_iso = datetime.now(timezone.utc).isoformat()
            async with client.pipeline(transaction=False) as pipe:
                for offset, score_val in enumerate(computed_scores):
                    orig_idx = missing_indices[offset]
                    scores[orig_idx] = score_val
                    pipe.set(
                        cache_keys[orig_idx],
                        json.dumps({"score": score_val, "scored_at": now_iso}),
                        ex=settings.RERANK_CACHE_TTL_SECONDS,
                    )
                await pipe.execute()

        reranked = [
            RerankedChunk(
                candidate=candidates[i],
                rerank_score=float(scores[i] if scores[i] is not None else 0.0),
            )
            for i in range(len(candidates))
        ]
        reranked.sort(key=lambda item: item.rerank_score, reverse=True)
        return reranked[:top_k]
    finally:
        elapsed = time.perf_counter() - start_time
        record_retrieval_latency(tenant_id, "rerank", elapsed)
        if owns_client:
            await client.aclose()