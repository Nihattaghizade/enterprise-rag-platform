from collections.abc import AsyncGenerator
from typing import Optional, Sequence

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from app.config import get_settings
from app.generation.prompts import INSUFFICIENT_EVIDENCE_RESPONSE, build_answer_messages
from app.retrieval.types import AssembledContext


def get_chat_model(model_name: Optional[str] = None) -> BaseChatModel:
    """Section 8: Create configurable LangChain chat model with temperature 0.1-0.2, retry, and fallback policy."""
    settings = get_settings()
    resolved_model = model_name or settings.LLM_MODEL_NAME
    temperature = max(0.0, min(0.2, settings.LLM_TEMPERATURE))

    primary = ChatOpenAI(
        model=resolved_model,
        api_key=settings.LLM_API_KEY,
        temperature=temperature,
        streaming=True,
        max_retries=2,
    )

    if settings.LLM_FALLBACK_MODEL_NAME and settings.LLM_FALLBACK_MODEL_NAME != resolved_model:
        fallback = ChatOpenAI(
            model=settings.LLM_FALLBACK_MODEL_NAME,
            api_key=settings.LLM_API_KEY,
            temperature=temperature,
            streaming=True,
            max_retries=1,
        )
        return primary.with_fallbacks([fallback])  # type: ignore[return-value]

    return primary


async def stream_answer(
    question: str,
    contexts: Sequence[AssembledContext],
    *,
    chat_model: Optional[BaseChatModel] = None,
) -> AsyncGenerator[str, None]:
    """Section 8 & Guardrail #6: Stream answer tokens via LangChain astream(); abstain when context is empty."""
    if not contexts:
        yield INSUFFICIENT_EVIDENCE_RESPONSE
        return

    messages = build_answer_messages(question, contexts)
    model = chat_model or get_chat_model()

    async for chunk in model.astream(messages):
        content = getattr(chunk, "content", "")
        if isinstance(content, str) and content:
            yield content