import uuid
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text as sql_text,
)
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base declarative class for all PostgreSQL ORM models."""


class TimestampMixin:
    """Section 5.4A: All tables include created_at and updated_at timestamp columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class User(Base, TimestampMixin):
    """Section 5.4A: users table."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sql_text("true")
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=sql_text("'{}'::jsonb"),
    )


class Tenant(Base, TimestampMixin):
    """Section 5.4A: tenants table."""

    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=sql_text("'{}'::jsonb"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sql_text("true")
    )


class Membership(Base, TimestampMixin):
    """Section 5.4A: memberships table."""

    __tablename__ = "memberships"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "tenant_id", name="uq_memberships_user_tenant"),
        Index("idx_memberships_user_id", "user_id"),
        Index("idx_memberships_tenant_id", "tenant_id"),
        Index("idx_memberships_tenant_user", "tenant_id", "user_id"),
    )


class Document(Base, TimestampMixin):
    """Section 5.4A: documents table."""

    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    doc_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    department: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(Text),
        nullable=False,
        default=list,
        server_default=sql_text("'{}'::text[]"),
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=sql_text("1")
    )
    status: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    char_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    uploader_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    deprecated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=sql_text("'{}'::jsonb"),
    )

    __table_args__ = (
        Index("idx_documents_tenant_id", "tenant_id"),
        Index("idx_documents_tenant_status", "tenant_id", "status"),
        Index(
            "idx_documents_tenant_id_status_version",
            "tenant_id",
            "status",
            "version",
        ),
        Index("idx_documents_uploader_id", "uploader_id"),
    )


class ParentContext(Base, TimestampMixin):
    """Section 5.4A: parent_contexts table."""

    __tablename__ = "parent_contexts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    section_number: Mapped[str] = mapped_column(Text, nullable=False)
    strategy: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    storage_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False)
    section_title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_offset: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    end_offset: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=sql_text("'{}'::jsonb"),
    )

    __table_args__ = (
        CheckConstraint(
            "text IS NOT NULL OR storage_key IS NOT NULL",
            name="ck_parent_contexts_text_or_storage_key",
        ),
        Index("idx_parent_contexts_document_id", "document_id"),
        Index("idx_parent_contexts_document_strategy", "document_id", "strategy"),
        Index("idx_parent_contexts_section_number", "section_number"),
    )


class AuditLog(Base, TimestampMixin):
    """Section 5.4A: audit_logs table."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    resource_type: Mapped[str] = mapped_column(Text, nullable=False)
    resource_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=sql_text("'{}'::jsonb"),
    )
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_audit_logs_tenant_id", "tenant_id"),
        Index("idx_audit_logs_tenant_action", "tenant_id", "action"),
        Index("idx_audit_logs_resource", "resource_type", "resource_id"),
    )


class QueryLog(Base, TimestampMixin):
    """Section 5.4A: query_logs table."""

    __tablename__ = "query_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    retrieval_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=sql_text("'{}'::jsonb"),
    )
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False)
    reranked_count: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_context_count: Mapped[int] = mapped_column(Integer, nullable=False)
    answer_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False)
    feedback_value: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feedback_label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=sql_text("'{}'::jsonb"),
    )

    __table_args__ = (
        Index("idx_query_logs_tenant_id", "tenant_id"),
        Index("idx_query_logs_tenant_user", "tenant_id", "user_id"),
        Index("idx_query_logs_created_at", "created_at"),
    )


class UsageRecord(Base, TimestampMixin):
    """Section 5.4A: usage_records table."""

    __tablename__ = "usage_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    embedding_tokens: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=sql_text("0")
    )
    rerank_calls: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=sql_text("0")
    )
    rerank_pairs: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=sql_text("0")
    )
    llm_input_tokens: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=sql_text("0")
    )
    llm_output_tokens: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=sql_text("0")
    )
    storage_bytes: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=sql_text("0")
    )
    document_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sql_text("0")
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=sql_text("'{}'::jsonb"),
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "date", name="uq_usage_records_tenant_date"),
        Index("idx_usage_records_tenant_date", "tenant_id", "date"),
    )