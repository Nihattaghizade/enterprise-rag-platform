import re
import uuid
from typing import Callable, Optional

import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import (
    RECURSIVE_CHILD_OVERLAP_TOKENS,
    RECURSIVE_CHILD_TARGET_TOKENS,
    RECURSIVE_PARENT_TARGET_TOKENS,
    SEMANTIC_SECTION_TOKEN_THRESHOLD,
)
from app.ingestion.embed import _encode_batch_sync
from app.ingestion.sections import count_tokens
from app.ingestion.types import ChunkPlan, ParentContextData, RetrievalChunkData, Section

# Rule-based hierarchy per Section 6.2: headings, paragraphs, lines, sentences, words
_RECURSIVE_SEPARATORS = ["\n# ", "\n## ", "\n### ", "\n\n", "\n", ". ", " ", ""]


def _get_parent_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=RECURSIVE_PARENT_TARGET_TOKENS,
        chunk_overlap=0,
        separators=_RECURSIVE_SEPARATORS,
    )


def _get_child_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=RECURSIVE_CHILD_TARGET_TOKENS,
        chunk_overlap=RECURSIVE_CHILD_OVERLAP_TOKENS,
        separators=_RECURSIVE_SEPARATORS,
    )


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    a = np.asarray(vec_a, dtype=np.float32)
    b = np.asarray(vec_b, dtype=np.float32)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0.0:
        return 0.0
    return float(np.dot(a, b) / denom)


def recursive_chunk_section(
    section: Section,
    base_parent_index: int = 0,
) -> tuple[list[ParentContextData], list[RetrievalChunkData]]:
    """Section 6.2: Build recursive parent contexts (~1,200 tokens) and child retrieval chunks (~350 tokens, 50 overlap)."""
    parent_splitter = _get_parent_splitter()
    child_splitter = _get_child_splitter()

    parent_texts = parent_splitter.split_text(section.text) or [section.text.strip()]

    parents: list[ParentContextData] = []
    children: list[RetrievalChunkData] = []
    child_idx_counter = 0

    for p_offset, p_text in enumerate(parent_texts):
        parent_id = uuid.uuid4()
        parent_index = base_parent_index + p_offset
        parent_data = ParentContextData(
            id=parent_id,
            section_number=section.section_number,
            strategy="recursive",
            text=p_text,
            token_count=count_tokens(p_text),
            section_title=section.section_title,
            start_offset=section.start_offset,
            end_offset=section.end_offset,
            metadata=section.metadata,
        )
        parents.append(parent_data)

        child_texts = child_splitter.split_text(p_text) or [p_text]
        for c_text in child_texts:
            children.append(
                RetrievalChunkData(
                    chunk_id=uuid.uuid4(),
                    parent_id=parent_id,
                    parent_index=parent_index,
                    section_number=section.section_number,
                    section_title=section.section_title,
                    chunk_index=child_idx_counter,
                    strategy="recursive",
                    text=c_text,
                    token_count=count_tokens(c_text),
                    metadata=section.metadata,
                )
            )
            child_idx_counter += 1

    return parents, children


def semantic_chunk_section(
    section: Section,
    base_parent_index: int = 0,
    sentence_embed_fn: Optional[Callable[[list[str]], list[list[float]]]] = None,
) -> tuple[list[ParentContextData], list[RetrievalChunkData]]:
    """Section 6.2: Topic shifts detected from embedding similarity between adjacent sentence windows
    for sections > 2,500 tokens, shaped toward target 350 tokens and overlap 50."""
    parent_splitter = _get_parent_splitter()
    child_splitter = _get_child_splitter()
    embed_fn = sentence_embed_fn or _encode_batch_sync

    parent_texts = parent_splitter.split_text(section.text) or [section.text.strip()]

    parents: list[ParentContextData] = []
    children: list[RetrievalChunkData] = []
    child_idx_counter = 0

    for p_offset, p_text in enumerate(parent_texts):
        parent_id = uuid.uuid4()
        parent_index = base_parent_index + p_offset
        parent_data = ParentContextData(
            id=parent_id,
            section_number=section.section_number,
            strategy="semantic",
            text=p_text,
            token_count=count_tokens(p_text),
            section_title=section.section_title,
            start_offset=section.start_offset,
            end_offset=section.end_offset,
            metadata=section.metadata,
        )
        parents.append(parent_data)

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", p_text) if s.strip()]
        if len(sentences) <= 1:
            sentence_vectors = [[1.0]] * len(sentences)
        else:
            sentence_vectors = embed_fn(sentences)

        semantic_groups: list[str] = []
        current_group: list[str] = []
        current_tokens = 0

        for idx, sent in enumerate(sentences):
            sent_tokens = count_tokens(sent)
            topic_shift = False
            if current_group and idx > 0 and idx < len(sentence_vectors):
                sim = _cosine_similarity(sentence_vectors[idx - 1], sentence_vectors[idx])
                if sim < 0.55 and current_tokens >= 150:
                    topic_shift = True

            if (current_tokens + sent_tokens > RECURSIVE_CHILD_TARGET_TOKENS and current_group) or topic_shift:
                semantic_groups.append(" ".join(current_group))
                overlap_group: list[str] = []
                overlap_toks = 0
                for prev_sent in reversed(current_group):
                    pt = count_tokens(prev_sent)
                    if overlap_toks + pt <= RECURSIVE_CHILD_OVERLAP_TOKENS:
                        overlap_group.insert(0, prev_sent)
                        overlap_toks += pt
                    else:
                        break
                current_group = overlap_group + [sent]
                current_tokens = overlap_toks + sent_tokens
            else:
                current_group.append(sent)
                current_tokens += sent_tokens

        if current_group:
            semantic_groups.append(" ".join(current_group))

        for group_text in semantic_groups:
            shaped_texts = child_splitter.split_text(group_text) or [group_text]
            for c_text in shaped_texts:
                children.append(
                    RetrievalChunkData(
                        chunk_id=uuid.uuid4(),
                        parent_id=parent_id,
                        parent_index=parent_index,
                        section_number=section.section_number,
                        section_title=section.section_title,
                        chunk_index=child_idx_counter,
                        strategy="semantic",
                        text=c_text,
                        token_count=count_tokens(c_text),
                        metadata=section.metadata,
                    )
                )
                child_idx_counter += 1

    return parents, children


def build_chunk_plan(sections: list[Section]) -> ChunkPlan:
    """Section 6.2 Approved Chunking Policy."""
    all_parents: list[ParentContextData] = []
    all_children: list[RetrievalChunkData] = []

    for section in sections:
        sec_tokens = section.token_count or count_tokens(section.text)
        rec_parents, rec_children = recursive_chunk_section(
            section,
            base_parent_index=len(all_parents),
        )
        all_parents.extend(rec_parents)
        all_children.extend(rec_children)

        if sec_tokens > SEMANTIC_SECTION_TOKEN_THRESHOLD:
            sem_parents, sem_children = semantic_chunk_section(
                section,
                base_parent_index=len(all_parents),
            )
            all_parents.extend(sem_parents)
            all_children.extend(sem_children)

    return ChunkPlan(parents=all_parents, children=all_children)