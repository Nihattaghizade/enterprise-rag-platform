import uuid
from datetime import date
from typing import Any, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog, QueryLog, UsageRecord


class AuditRepository:
    """Tenant-scoped persistence for AuditLog, QueryLog, and UsageRecord."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_audit_log(
        self,
        *,
        tenant_id: uuid.UUID,
        action: str,
        resource_type: str,
        actor_user_id: Optional[uuid.UUID] = None,
        resource_id: Optional[uuid.UUID] = None,
        details: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        entry = AuditLog(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def list_audit_logs(
        self,
        tenant_id: uuid.UUID,
        action: Optional[str] = None,
        limit: int = 100,
    ) -> Sequence[AuditLog]:
        stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        if action is not None:
            stmt = stmt.where(AuditLog.action == action)
        stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_query_log(
        self,
        *,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        query_text: str,
        candidate_count: int,
        reranked_count: int,
        parent_context_count: int,
        answer_tokens: int,
        input_tokens: int,
        latency_ms: int,
        cache_hit: bool,
        retrieval_config: Optional[dict[str, Any]] = None,
        feedback_value: Optional[int] = None,
        feedback_label: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> QueryLog:
        query_log = QueryLog(
            tenant_id=tenant_id,
            user_id=user_id,
            query_text=query_text,
            retrieval_config=retrieval_config or {},
            candidate_count=candidate_count,
            reranked_count=reranked_count,
            parent_context_count=parent_context_count,
            answer_tokens=answer_tokens,
            input_tokens=input_tokens,
            latency_ms=latency_ms,
            cache_hit=cache_hit,
            feedback_value=feedback_value,
            feedback_label=feedback_label,
            metadata_=metadata or {},
        )
        self.session.add(query_log)
        await self.session.flush()
        return query_log

    async def increment_usage_record(
        self,
        *,
        tenant_id: uuid.UUID,
        usage_date: date,
        embedding_tokens: int = 0,
        rerank_calls: int = 0,
        rerank_pairs: int = 0,
        llm_input_tokens: int = 0,
        llm_output_tokens: int = 0,
        storage_bytes_delta: int = 0,
        document_count_delta: int = 0,
    ) -> UsageRecord:
        stmt = (
            pg_insert(UsageRecord)
            .values(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                date=usage_date,
                embedding_tokens=embedding_tokens,
                rerank_calls=rerank_calls,
                rerank_pairs=rerank_pairs,
                llm_input_tokens=llm_input_tokens,
                llm_output_tokens=llm_output_tokens,
                storage_bytes=storage_bytes_delta,
                document_count=document_count_delta,
            )
            .on_conflict_do_update(
                constraint="uq_usage_records_tenant_date",
                set_={
                    "embedding_tokens": UsageRecord.embedding_tokens + embedding_tokens,
                    "rerank_calls": UsageRecord.rerank_calls + rerank_calls,
                    "rerank_pairs": UsageRecord.rerank_pairs + rerank_pairs,
                    "llm_input_tokens": UsageRecord.llm_input_tokens + llm_input_tokens,
                    "llm_output_tokens": UsageRecord.llm_output_tokens + llm_output_tokens,
                    "storage_bytes": UsageRecord.storage_bytes + storage_bytes_delta,
                    "document_count": UsageRecord.document_count + document_count_delta,
                },
            )
            .returning(UsageRecord)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.scalar_one()

    async def get_usage_record(
        self,
        tenant_id: uuid.UUID,
        usage_date: date,
    ) -> Optional[UsageRecord]:
        stmt = select(UsageRecord).where(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.date == usage_date,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()