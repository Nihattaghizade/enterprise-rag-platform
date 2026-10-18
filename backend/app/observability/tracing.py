import os
from functools import wraps
from typing import Any, Callable, TypeVar

from langsmith import traceable

from app.config import get_settings

F = TypeVar("F", bound=Callable[..., Any])


def configure_langsmith() -> bool:
    """Configure LangSmith environment variables only when explicitly enabled."""
    settings = get_settings()
    if settings.LANGCHAIN_TRACING_V2 and settings.LANGCHAIN_API_KEY:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_ENDPOINT"] = settings.LANGCHAIN_ENDPOINT
        os.environ["LANGCHAIN_API_KEY"] = settings.LANGCHAIN_API_KEY
        os.environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT
        return True
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
    return False


def trace_ingestion(name: str = "ingestion_pipeline") -> Callable[[F], F]:
    """Wrap an ingestion operation in a LangSmith trace when tracing is enabled."""

    def decorator(func: F) -> F:
        settings = get_settings()
        if not (settings.LANGCHAIN_TRACING_V2 and settings.LANGCHAIN_API_KEY):
            return func
        traced_fn = traceable(run_type="chain", name=name)(func)

        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            return await traced_fn(*args, **kwargs)

        return async_wrapper  # type: ignore[return-value]

    return decorator


def trace_chat(name: str = "chat_query_pipeline") -> Callable[[F], F]:
    """Wrap a retrieval/generation chat operation in a LangSmith trace when tracing is enabled."""

    def decorator(func: F) -> F:
        settings = get_settings()
        if not (settings.LANGCHAIN_TRACING_V2 and settings.LANGCHAIN_API_KEY):
            return func
        traced_fn = traceable(run_type="chain", name=name)(func)

        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            return await traced_fn(*args, **kwargs)

        return async_wrapper  # type: ignore[return-value]

    return decorator