import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from app.config import (
    HYBRID_CANDIDATE_LIMIT,
    MAX_PARENT_CONTEXTS_PER_ANSWER,
    RERANKED_CHILD_LIMIT,
)


@dataclass
class RetrievalRequest:
    """Tenant-scoped retrieval request parameters."""

    tenant_id: uuid.UUID
    query: str
    candidate_limit: int = HYBRID_CANDIDATE_LIMIT
    rerank_limit: int = RERANKED_CHILD_LIMIT
    max_parent_contexts: int = MAX_PARENT_CONTEXTS_PER_ANSWER
    tags: Optional[list[str]] = None
    doc_ids: Optional[list[uuid.UUID]] = None


@dataclass
class CandidateChunk:
    """Child retrieval chunk returned from Qdrant hybrid search (RRF)."""

    chunk_id: uuid.UUID
    doc_id: uuid.UUID
    parent_id: uuid.UUID
    tenant_id: uuid.UUID
    chunk_text: str
    section_number: str
    section_title: Optional[str]
    chunk_index: int
    strategy: str  # "recursive" or "semantic"
    document_version: int
    rrf_score: float
    language: Optional[str] = "en"
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RerankedChunk:
    """Child retrieval chunk scored and sorted by BAAI/bge-reranker-v2-m3."""

    candidate: CandidateChunk
    rerank_score: float


@dataclass
class AssembledContext:
    """Resolved and deduplicated parent context passed to the LLM within budget."""

    parent_id: uuid.UUID
    doc_id: uuid.UUID
    document_title: str
    section_number: str
    section_title: Optional[str]
    strategy: str
    text: str
    token_count: int
    top_rerank_score: float
    supporting_chunk_ids: list[uuid.UUID] = field(default_factory=list)