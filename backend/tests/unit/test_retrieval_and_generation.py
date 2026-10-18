import uuid

from app.generation.grounding import check_grounding, extract_citations
from app.generation.llm import stream_answer
from app.generation.prompts import INSUFFICIENT_EVIDENCE_RESPONSE, build_answer_messages
from app.retrieval.retriever import apply_semantic_first_policy
from app.retrieval.types import AssembledContext, CandidateChunk


def test_semantic_first_fallback_policy() -> None:
    tenant_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    parent_id = uuid.uuid4()

    rec_sec1 = CandidateChunk(
        chunk_id=uuid.uuid4(),
        doc_id=doc_id,
        parent_id=parent_id,
        tenant_id=tenant_id,
        chunk_text="Recursive chunk in section 1",
        section_number="1",
        section_title="Intro",
        chunk_index=0,
        strategy="recursive",
        document_version=1,
        rrf_score=0.8,
    )
    sem_sec1 = CandidateChunk(
        chunk_id=uuid.uuid4(),
        doc_id=doc_id,
        parent_id=parent_id,
        tenant_id=tenant_id,
        chunk_text="Semantic chunk in section 1",
        section_number="1",
        section_title="Intro",
        chunk_index=0,
        strategy="semantic",
        document_version=1,
        rrf_score=0.75,
    )
    rec_sec2 = CandidateChunk(
        chunk_id=uuid.uuid4(),
        doc_id=doc_id,
        parent_id=parent_id,
        tenant_id=tenant_id,
        chunk_text="Recursive chunk in section 2",
        section_number="2",
        section_title="Details",
        chunk_index=0,
        strategy="recursive",
        document_version=1,
        rrf_score=0.7,
    )

    filtered = apply_semantic_first_policy([rec_sec1, sem_sec1, rec_sec2])
    # Section 1 has semantic chunk -> keep sem_sec1, drop rec_sec1; Section 2 only has recursive -> keep rec_sec2
    assert len(filtered) == 2
    assert sem_sec1 in filtered
    assert rec_sec2 in filtered
    assert rec_sec1 not in filtered


async def test_prompts_citation_format_and_grounding_check() -> None:
    ctx = AssembledContext(
        parent_id=uuid.uuid4(),
        doc_id=uuid.uuid4(),
        document_title="Security Policy",
        section_number="3.2",
        section_title="Encryption",
        strategy="recursive",
        text="All buckets in MinIO must be private and encrypted.",
        token_count=20,
        top_rerank_score=0.95,
    )

    messages = build_answer_messages("How are MinIO buckets configured?", [ctx])
    assert len(messages) == 2
    assert "[doc: <title>, section: <section_number>]" in str(messages[0].content)
    assert "Security Policy" in str(messages[1].content)

    valid_answer = "MinIO buckets are private [doc: Security Policy, section: 3.2]."
    citations = extract_citations(valid_answer)
    assert citations == [{"title": "Security Policy", "section_number": "3.2"}]

    grounding_ok = check_grounding(valid_answer, [ctx])
    assert grounding_ok.is_grounded is True

    hallucinated = "MinIO is public [doc: Unknown Doc, section: 9.9]."
    grounding_bad = check_grounding(hallucinated, [ctx])
    assert grounding_bad.is_grounded is False
    assert grounding_bad.reason == "hallucinated_citation_target"

    # Abstain when contexts are empty (Guardrail #6)
    tokens: list[str] = []
    async for tok in stream_answer("Any question?", []):
        tokens.append(tok)
    assert "".join(tokens) == INSUFFICIENT_EVIDENCE_RESPONSE