import hashlib
import json
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any, Optional

from langchain_core.language_models.chat_models import BaseChatModel
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    HYBRID_CANDIDATE_LIMIT,
    MAX_PARENT_CONTEXTS_PER_ANSWER,
    RERANKED_CHILD_LIMIT,
    get_settings,
)
from app.core.rate_limit import check_rate_limit, get_redis_client
from app.db.repositories.audit import AuditRepository
from app.generation.grounding import check_grounding
from app.generation.llm import stream_answer
from app.generation.prompts import INSUFFICIENT_EVIDENCE_RESPONSE
from app.ingestion.sections import count_tokens
from app.observability.tracing import trace_chat
from app.retrieval.context_assembly import assemble_parent_contexts
from app.retrieval.rerank import rerank_candidates
from app.retrieval.retriever import TenantHybridRetriever
from app.services.usage_service import record_model_usage


def build_query_cache_key(
    tenant_id: uuid.UUID | str,
    query: str,
    tags: Optional[list[str]] = None,
    doc_ids: Optional[list[uuid.UUID]] = None,
) -> str:
    """Section 5.4C: rag:{env}:cache:query:{tenant_id}:{query_hash}:{retrieval_config_hash}"""
    settings = get_settings()
    normalized_q = " ".join(query.strip().lower().split())
    query_hash = hashlib.sha256(normalized_q.encode("utf-8")).hexdigest()

    config_payload = {
        "candidate_limit": HYBRID_CANDIDATE_LIMIT,
        "rerank_limit": RERANKED_CHILD_LIMIT,
        "max_parents": MAX_PARENT_CONTEXTS_PER_ANSWER,
        "model": settings.LLM_MODEL_NAME,
        "tags": sorted(tags or []),
        "doc_ids": sorted(str(d) for d in (doc_ids or [])),
    }
    config_hash = hashlib.sha256(
        json.dumps(config_payload, sort_keys=True).encode("utf-8")
    ).hexdigest()[:16]

    return f"rag:{settings.ENVIRONMENT}:cache:query:{tenant_id}:{query_hash}:{config_hash}"


def format_sse_event(event_type: str, data: dict[str, Any]) -> str:
    """Serialize an SSE event block."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@trace_chat("run_chat_query")
async def run_chat_query(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    query: str,
    tags: Optional[list[str]] = None,
    doc_ids: Optional[list[uuid.UUID]] = None,
    redis_client: Optional[Redis] = None,
    chat_model: Optional[BaseChatModel] = None,
) -> AsyncGenerator[str, None]:
    """Section 9 & 13.2: Full query orchestration yielding SSE events."""
    settings = get_settings()
    start_time = time.perf_counter()
    owns_redis = redis_client is None
    rclient = redis_client or get_redis_client()

    try:
        # 1. Per-user & per-tenant Redis rate limit
        await check_rate_limit(rclient, user_id=user_id, tenant_id=tenant_id, scope="api")

        # 2. Check Redis query-answer cache
        cache_key = build_query_cache_key(tenant_id, query, tags=tags, doc_ids=doc_ids)
        cached_raw = await rclient.get(cache_key)
        if cached_raw is not None:
            cached_data = json.loads(cached_raw)
            for cit in cached_data.get("citations", []):
                yield format_sse_event("citation", cit)
            yield format_sse_event("token", {"text": cached_data["answer"]})
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            yield format_sse_event("done", {"cache_hit": True, "latency_ms": latency_ms})

            audit_repo = AuditRepository(session)
            await audit_repo.create_query_log(
                tenant_id=tenant_id,
                user_id=user_id,
                query_text=query,
                candidate_count=0,
                reranked_count=0,
                parent_context_count=len(cached_data.get("citations", [])),
                answer_tokens=count_tokens(cached_data["answer"]),
                input_tokens=0,
                latency_ms=latency_ms,
                cache_hit=True,
            )
            await session.commit()
            return

        # 3. Tenant-filtered hybrid Qdrant retrieval (top 60) + semantic-first policy
        retriever = TenantHybridRetriever(
            tenant_id=tenant_id,
            candidate_limit=HYBRID_CANDIDATE_LIMIT,
            tags=tags,
            doc_ids=doc_ids,
        )
        candidates = await retriever.aget_candidates(query)

        # 4. BGE reranking (top 60 -> top 8)
        reranked = await rerank_candidates(
            query=query,
            candidates=candidates,
            top_k=RERANKED_CHILD_LIMIT,
            redis_client=rclient,
        )

        # 5. Resolve and deduplicate parent contexts (up to 3)
        assembled_contexts = await assemble_parent_contexts(
            session=session,
            tenant_id=tenant_id,
            reranked_chunks=reranked,
            max_parents=MAX_PARENT_CONTEXTS_PER_ANSWER,
        )

        # 6. Emit citation SSE events for assembled parent contexts
        citations_payload: list[dict[str, Any]] = []
        for ctx in assembled_contexts:
            cit_item = {
                "doc_id": str(ctx.doc_id),
                "title": ctx.document_title,
                "section_number": ctx.section_number,
                "section_title": ctx.section_title,
                "parent_id": str(ctx.parent_id),
            }
            citations_payload.append(cit_item)
            yield format_sse_event("citation", cit_item)

        # 7. Stream LLM answer tokens
        collected_tokens: list[str] = []
        async for token in stream_answer(query, assembled_contexts, chat_model=chat_model):
            collected_tokens.append(token)
            yield format_sse_event("token", {"text": token})

        full_answer = "".join(collected_tokens).strip()

        # 8. Optional grounding check behind feature flag (Section 8)
        grounding_passed = True
        if settings.ENABLE_GROUNDING_CHECK and assembled_contexts:
            grounding_res = check_grounding(full_answer, assembled_contexts)
            grounding_passed = grounding_res.is_grounded

        latency_ms = int((time.perf_counter() - start_time) * 1000)
        yield format_sse_event(
            "done",
            {
                "cache_hit": False,
                "latency_ms": latency_ms,
                "grounded": grounding_passed,
            },
        )

        # 9. Cache safe grounded result in Redis (Section 5.4C)
        if grounding_passed and full_answer and full_answer != INSUFFICIENT_EVIDENCE_RESPONSE:
            cache_value = {
                "answer": full_answer,
                "citations": citations_payload,
                "retrieval_config_version": "v1",
                "model_id": settings.LLM_MODEL_NAME,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await rclient.set(
                cache_key,
                json.dumps(cache_value),
                ex=settings.QUERY_CACHE_TTL_SECONDS,
            )

        # 10. Persist QueryLog and UsageRecord
        query_toks = count_tokens(query)
        context_toks = sum(c.token_count for c in assembled_contexts)
        answer_toks = count_tokens(full_answer)

        audit_repo = AuditRepository(session)
        await audit_repo.create_query_log(
            tenant_id=tenant_id,
            user_id=user_id,
            query_text=query,
            retrieval_config={
                "candidate_limit": HYBRID_CANDIDATE_LIMIT,
                "reranked_limit": RERANKED_CHILD_LIMIT,
                "max_parents": MAX_PARENT_CONTEXTS_PER_ANSWER,
            },
            candidate_count=len(candidates),
            reranked_count=len(reranked),
            parent_context_count=len(assembled_contexts),
            answer_tokens=answer_toks,
            input_tokens=query_toks + context_toks,
            latency_ms=latency_ms,
            cache_hit=False,
        )
        await record_model_usage(
            session,
            tenant_id=tenant_id,
            embedding_tokens=query_toks,
            rerank_calls=1 if candidates else 0,
            rerank_pairs=len(candidates),
            llm_input_tokens=query_toks + context_toks,
            llm_output_tokens=answer_toks,
        )
        await session.commit()
    finally:
        if owns_redis:
            await rclient.aclose()