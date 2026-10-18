import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import MAX_PARENT_CONTEXTS_PER_ANSWER, RECURSIVE_PARENT_MAX_TOKENS
from app.db.models import Document, ParentContext
from app.ingestion.sections import count_tokens
from app.retrieval.types import AssembledContext, RerankedChunk
from app.storage.s3_adapter import download_object

DEFAULT_CONTEXT_TOKEN_BUDGET = MAX_PARENT_CONTEXTS_PER_ANSWER * RECURSIVE_PARENT_MAX_TOKENS


async def assemble_parent_contexts(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    reranked_chunks: Sequence[RerankedChunk],
    *,
    max_parents: int = MAX_PARENT_CONTEXTS_PER_ANSWER,
    max_total_tokens: int = DEFAULT_CONTEXT_TOKEN_BUDGET,
) -> list[AssembledContext]:
    """Section 7.1: Fetch parent contexts scoped by tenant_id, deduplicate in rank order, and fit LLM budget (max 3)."""
    if not reranked_chunks:
        return []

    # 1. Deduplicate parent_ids while preserving highest rerank order
    ordered_parent_ids: list[uuid.UUID] = []
    parent_scores: dict[uuid.UUID, float] = {}
    parent_supporting_chunks: dict[uuid.UUID, list[uuid.UUID]] = {}

    for item in reranked_chunks:
        pid = item.candidate.parent_id
        if pid not in parent_scores:
            ordered_parent_ids.append(pid)
            parent_scores[pid] = item.rerank_score
            parent_supporting_chunks[pid] = []
        parent_supporting_chunks[pid].append(item.candidate.chunk_id)

    # 2. Query PostgreSQL joining ParentContext -> Document with mandatory tenant_id & status == 'ready'
    stmt = (
        select(ParentContext, Document.title)
        .join(Document, ParentContext.document_id == Document.id)
        .where(
            Document.tenant_id == tenant_id,
            Document.status == "ready",
            ParentContext.id.in_(ordered_parent_ids),
        )
    )
    result = await session.execute(stmt)
    rows_by_id: dict[uuid.UUID, tuple[ParentContext, str]] = {
        parent_row.id: (parent_row, doc_title)
        for parent_row, doc_title in result.all()
    }

    # 3. Assemble up to max_parents (3) within total token budget
    assembled: list[AssembledContext] = []
    used_tokens = 0

    for pid in ordered_parent_ids:
        if len(assembled) >= max_parents:
            break
        if pid not in rows_by_id:
            continue

        parent_row, doc_title = rows_by_id[pid]
        context_text = parent_row.text
        if not context_text and parent_row.storage_key:
            raw_bytes = await download_object(parent_row.storage_key)
            context_text = raw_bytes.decode("utf-8", errors="replace")

        if not context_text:
            continue

        tok_count = parent_row.token_count or count_tokens(context_text)
        if used_tokens + tok_count > max_total_tokens and assembled:
            continue

        assembled.append(
            AssembledContext(
                parent_id=parent_row.id,
                doc_id=parent_row.document_id,
                document_title=doc_title,
                section_number=parent_row.section_number,
                section_title=parent_row.section_title,
                strategy=parent_row.strategy,
                text=context_text,
                token_count=tok_count,
                top_rerank_score=parent_scores[pid],
                supporting_chunk_ids=parent_supporting_chunks[pid],
            )
        )
        used_tokens += tok_count

    return assembled