from typing import Sequence

from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate

from app.retrieval.types import AssembledContext

INSUFFICIENT_EVIDENCE_RESPONSE = (
    "I do not have sufficient evidence in the authorized tenant documents to answer this question."
)

SYSTEM_PROMPT_TEMPLATE = """You are an enterprise retrieval-augmented assistant.
Follow these strict non-negotiable grounding rules:
1. Answer ONLY from the supplied parent context blocks below. Do NOT use outside knowledge or assumptions.
2. Every factual claim MUST be immediately followed by an inline citation in this exact format: [doc: <title>, section: <section_number>].
3. If the supplied context is empty or insufficient to answer the user's question, respond with:
"I do not have sufficient evidence in the authorized tenant documents to answer this question."
"""

HUMAN_PROMPT_TEMPLATE = """Supplied Parent Contexts:
{formatted_context}

Question:
{question}
"""

ANSWER_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT_TEMPLATE),
        ("human", HUMAN_PROMPT_TEMPLATE),
    ]
)


def format_contexts_for_prompt(contexts: Sequence[AssembledContext]) -> str:
    """Format assembled parent contexts with clear title and section headers for citation."""
    if not contexts:
        return "NO_CONTEXT_AVAILABLE"

    blocks: list[str] = []
    for idx, ctx in enumerate(contexts, start=1):
        heading_suffix = f" ({ctx.section_title})" if ctx.section_title else ""
        blocks.append(
            f"--- Context {idx} | doc: {ctx.document_title} | section: {ctx.section_number}{heading_suffix} ---\n"
            f"{ctx.text}"
        )
    return "\n\n".join(blocks)


def build_answer_messages(
    question: str,
    contexts: Sequence[AssembledContext],
) -> list[BaseMessage]:
    """Section 8: Render system and user messages for grounded answer generation."""
    formatted_context = format_contexts_for_prompt(contexts)
    return ANSWER_PROMPT.format_messages(
        formatted_context=formatted_context,
        question=question.strip(),
    )