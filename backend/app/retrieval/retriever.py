import asyncio
import uuid
from typing import Any, Optional

from langchain_core.callbacks import AsyncCallbackManagerForRetrieverRun, CallbackManagerForRetrieverRun
from langchain_core.documents import Document as LCDocument
from langchain_core.retrievers import BaseRetriever
from pydantic import Field

from app.config import HYBRID_CANDIDATE_LIMIT
from app.retrieval.qdrant_search import hybrid_search
from app.retrieval.types import CandidateChunk


def apply_semantic_first_policy(
    candidates: list[CandidateChunk],
    allow_recursive_fallback: bool = True,
) -> list[CandidateChunk]:
    """Section 6.2 & 7.3: For any (doc_id, section_number) where semantic chunks exist,
    semantic chunks are primary; recursive chunks are retained as fallback."""
    sections_with_semantic: set[tuple[uuid.UUID, str]] = {
        (c.doc_id, c.section_number)
        for c in candidates
        if c.strategy == "semantic"
    }

    if not sections_with_semantic:
        return candidates

    primary_filtered: list[CandidateChunk] = []
    fallback_recursive: list[CandidateChunk] = []

    for cand in candidates:
        key = (cand.doc_id, cand.section_number)
        if key in sections_with_semantic:
            if cand.strategy == "semantic":
                primary_filtered.append(cand)
            else:
                fallback_recursive.append(cand)
        else:
            primary_filtered.append(cand)

    if primary_filtered or not allow_recursive_fallback:
        return primary_filtered
    return fallback_recursive


class TenantHybridRetriever(BaseRetriever):
    """Section 7.1: Custom LangChain BaseRetriever applying mandatory tenant filters and semantic-first policy."""

    tenant_id: uuid.UUID
    candidate_limit: int = Field(default=HYBRID_CANDIDATE_LIMIT)
    tags: Optional[list[str]] = None
    doc_ids: Optional[list[uuid.UUID]] = None

    async def aget_candidates(self, query: str) -> list[CandidateChunk]:
        """Retrieve hybrid RRF candidates and apply semantic-first strategy selection."""
        raw_candidates = await hybrid_search(
            tenant_id=self.tenant_id,
            query=query,
            limit=self.candidate_limit,
            tags=self.tags,
            doc_ids=self.doc_ids,
        )
        return apply_semantic_first_policy(raw_candidates)

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[AsyncCallbackManagerForRetrieverRun] = None,
    ) -> list[LCDocument]:
        """LangChain async retriever contract returning tenant-scoped Documents."""
        candidates = await self.aget_candidates(query)
        docs: list[LCDocument] = []
        for cand in candidates:
            docs.append(
                LCDocument(
                    page_content=cand.chunk_text,
                    metadata={
                        "chunk_id": str(cand.chunk_id),
                        "doc_id": str(cand.doc_id),
                        "parent_id": str(cand.parent_id),
                        "tenant_id": str(cand.tenant_id),
                        "section_number": cand.section_number,
                        "section_title": cand.section_title,
                        "chunk_index": cand.chunk_index,
                        "strategy": cand.strategy,
                        "document_version": cand.document_version,
                        "rrf_score": cand.rrf_score,
                    },
                )
            )
        return docs

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> list[LCDocument]:
        """Sync fallback delegating to _aget_relevant_documents."""
        return asyncio.run(self._aget_relevant_documents(query, run_manager=run_manager))