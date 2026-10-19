import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class DocumentCreateMetadata(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    author: Optional[str] = None
    department: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    language: Optional[str] = None


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    title: str
    file_name: str
    mime_type: str
    doc_type: Optional[str] = None
    author: Optional[str] = None
    department: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    version: int
    status: str
    language: Optional[str] = None
    page_count: Optional[int] = None
    char_count: Optional[int] = None
    uploader_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    download_url: Optional[str] = None


class DocumentUploadAcceptedResponse(BaseModel):
    document: DocumentResponse
    job_id: str
    status: str = "processing"


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int


class DocumentStatusResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    status: str
    version: int
    page_count: Optional[int] = None
    char_count: Optional[int] = None
    updated_at: datetime


class DocumentReindexResponse(BaseModel):
    document_id: uuid.UUID
    job_id: str
    status: str = "processing"
    details: dict[str, Any] = Field(default_factory=dict)