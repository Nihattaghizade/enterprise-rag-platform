import uuid
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    tags: Optional[list[str]] = None
    doc_ids: Optional[list[uuid.UUID]] = None


class CitationSchema(BaseModel):
    doc_id: uuid.UUID
    title: str
    section_number: str
    section_title: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None


class ChatSSEEvent(BaseModel):
    event: Literal["token", "citation", "done", "error"]
    data: dict[str, Any]