import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ParsedDocument:
    """Extracted text and source metadata from a supported file format."""

    text: str
    mime_type: str
    page_count: Optional[int] = None
    language: Optional[str] = "en"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Section:
    """Structural document section identified by heading and source offsets."""

    section_number: str
    section_title: Optional[str]
    text: str
    start_offset: int
    end_offset: int
    token_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParentContextData:
    """Transfer object for a parent context (target 1,200 tokens; range 1,000-1,400)."""

    id: uuid.UUID
    section_number: str
    strategy: str  # "recursive" or "semantic"
    text: str
    token_count: int
    section_title: Optional[str] = None
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None
    storage_key: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_repository_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "section_number": self.section_number,
            "strategy": self.strategy,
            "text": self.text,
            "storage_key": self.storage_key,
            "token_count": self.token_count,
            "section_title": self.section_title,
            "start_offset": self.start_offset,
            "end_offset": self.end_offset,
            "metadata": self.metadata,
        }


@dataclass
class RetrievalChunkData:
    """Transfer object for a child retrieval chunk (target 350 tokens; range 300-400; overlap 50)."""

    chunk_id: uuid.UUID
    parent_id: uuid.UUID
    parent_index: int
    section_number: str
    section_title: Optional[str]
    chunk_index: int
    strategy: str  # "recursive" or "semantic"
    text: str
    token_count: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ChunkPlan:
    """Combined parent contexts and child retrieval chunks produced for a document."""

    parents: list[ParentContextData]
    children: list[RetrievalChunkData]