import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.audit import AuditRepository
from app.db.repositories.documents import DocumentRepository
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.db.session import create_engine, get_session_factory


@pytest.fixture
async def db_session() -> AsyncSession:
    create_engine()
    factory = get_session_factory()
    async with factory() as session:
        yield session
        await session.rollback()


async def test_multi_tenant_isolation_and_repositories(db_session: AsyncSession) -> None:
    """Verify CRUD and strict tenant_id isolation across repositories."""
    user_repo = UserRepository(db_session)
    tenant_repo = TenantRepository(db_session)
    doc_repo = DocumentRepository(db_session)
    audit_repo = AuditRepository(db_session)

    suffix = uuid.uuid4().hex[:8]
    user = await user_repo.create(
        email=f"user-{suffix}@example.com",
        password_hash="hashed_pw",
    )
    tenant_a = await tenant_repo.create_tenant(name=f"Tenant A {suffix}", slug=f"tenant-a-{suffix}")
    tenant_b = await tenant_repo.create_tenant(name=f"Tenant B {suffix}", slug=f"tenant-b-{suffix}")

    membership = await tenant_repo.create_membership(
        user_id=user.id, tenant_id=tenant_a.id, role="admin"
    )
    assert membership.role == "admin"

    doc_a = await doc_repo.create(
        tenant_id=tenant_a.id,
        title="Policy A",
        file_name="policy_a.pdf",
        mime_type="application/pdf",
        storage_key=f"tenants/{tenant_a.id}/documents/1/versions/1/original/policy_a.pdf",
        uploader_id=user.id,
        status="processing",
    )

    # Tenant B must NEVER access Tenant A's document (Guardrail #1)
    cross_tenant_doc = await doc_repo.get_by_id(tenant_id=tenant_b.id, document_id=doc_a.id)
    assert cross_tenant_doc is None

    # Tenant A can access its own document
    own_doc = await doc_repo.get_by_id(tenant_id=tenant_a.id, document_id=doc_a.id)
    assert own_doc is not None
    assert own_doc.id == doc_a.id

    # ParentContext creation and tenant-isolated fetch
    parent_ids = await doc_repo.create_parent_contexts(
        document=doc_a,
        parents=[
            {
                "section_number": "1.1",
                "strategy": "recursive",
                "text": "Section 1.1 parent context text.",
                "token_count": 1150,
                "section_title": "Introduction",
            }
        ],
    )
    await doc_repo.mark_ready(document_id=doc_a.id, tenant_id=tenant_a.id, page_count=3, char_count=4200)

    # Tenant B cannot fetch Tenant A's parent contexts
    b_parents = await doc_repo.get_parent_contexts_by_ids(tenant_id=tenant_b.id, parent_ids=parent_ids)
    assert len(b_parents) == 0

    # Tenant A fetches its ready parent contexts
    a_parents = await doc_repo.get_parent_contexts_by_ids(tenant_id=tenant_a.id, parent_ids=parent_ids)
    assert len(a_parents) == 1
    assert a_parents[0].section_number == "1.1"

    # AuditLog, QueryLog, UsageRecord
    audit = await audit_repo.create_audit_log(
        tenant_id=tenant_a.id,
        actor_user_id=user.id,
        action="document.uploaded",
        resource_type="document",
        resource_id=doc_a.id,
    )
    assert audit.tenant_id == tenant_a.id

    qlog = await audit_repo.create_query_log(
        tenant_id=tenant_a.id,
        user_id=user.id,
        query_text="What is section 1.1?",
        candidate_count=60,
        reranked_count=8,
        parent_context_count=1,
        answer_tokens=120,
        input_tokens=600,
        latency_ms=340,
        cache_hit=False,
    )
    assert qlog.candidate_count == 60

    usage = await audit_repo.increment_usage_record(
        tenant_id=tenant_a.id,
        usage_date=date.today(),
        embedding_tokens=350,
        llm_input_tokens=600,
        llm_output_tokens=120,
        document_count_delta=1,
    )
    assert usage.embedding_tokens == 350