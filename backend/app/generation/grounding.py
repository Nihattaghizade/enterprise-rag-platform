import re
from dataclasses import dataclass
from typing import Sequence

from app.generation.prompts import INSUFFICIENT_EVIDENCE_RESPONSE
from app.retrieval.types import AssembledContext

_CITATION_REGEX = re.compile(
    r"\[doc:\s*(?P<title>[^,\]]+?)\s*,\s*section:\s*(?P<section>[^\]]+?)\s*\]"
)


@dataclass
class GroundingResult:
    """Result of validating answer citations against supplied parent contexts."""

    is_grounded: bool
    citations_found: list[dict[str, str]]
    invalid_citations: list[dict[str, str]]
    reason: str


def extract_citations(answer_text: str) -> list[dict[str, str]]:
    """Extract all [doc: <title>, section: <section_number>] citations from an answer."""
    matches: list[dict[str, str]] = []
    for match in _CITATION_REGEX.finditer(answer_text or ""):
        matches.append(
            {
                "title": match.group("title").strip(),
                "section_number": match.group("section").strip(),
            }
        )
    return matches


def check_grounding(
    answer_text: str,
    contexts: Sequence[AssembledContext],
) -> GroundingResult:
    """Section 8: Validate that answer contains valid citations matching supplied parent contexts."""
    cleaned = (answer_text or "").strip()
    if cleaned == INSUFFICIENT_EVIDENCE_RESPONSE:
        return GroundingResult(
            is_grounded=True,
            citations_found=[],
            invalid_citations=[],
            reason="abstained_insufficient_evidence",
        )

    if not contexts:
        return GroundingResult(
            is_grounded=False,
            citations_found=[],
            invalid_citations=[],
            reason="answer_generated_without_context",
        )

    citations = extract_citations(cleaned)
    if not citations:
        return GroundingResult(
            is_grounded=False,
            citations_found=[],
            invalid_citations=[],
            reason="missing_required_citations",
        )

    allowed_pairs = {
        (ctx.document_title.strip().lower(), ctx.section_number.strip().lower())
        for ctx in contexts
    }

    invalid: list[dict[str, str]] = []
    for cit in citations:
        pair = (cit["title"].lower(), cit["section_number"].lower())
        if pair not in allowed_pairs:
            invalid.append(cit)

    if invalid:
        return GroundingResult(
            is_grounded=False,
            citations_found=citations,
            invalid_citations=invalid,
            reason="hallucinated_citation_target",
        )

    return GroundingResult(
        is_grounded=True,
        citations_found=citations,
        invalid_citations=[],
        reason="grounded",
    )