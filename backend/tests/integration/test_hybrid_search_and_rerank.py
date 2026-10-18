import uuid

from app.core.security import hash_password
from app.db.repositories.documents import DocumentRepository
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.db.session import create_engine, get_session_factory
from app.ingestion.index import delete_document_points
from app.ingestion.worker import process_ingest_job
from app.retrieval.context_assembly import assemble_parent_contexts
from app.retrieval.qdrant_search import hybrid_search
from app.retrieval.rerank import rerank_candidates
from app.storage.s3_adapter import delete_object, upload_original


async def test_hybrid_search_rerank_and_context_assembly_isolation() -> None:
    """Verify Qdrant hybrid RRF retrieval, BGE reranking (top 8), parent context assembly (max 3), and tenant isolation."""
    create_engine()
    factory = get_session_factory()

    suffix = uuid.uuid4().hex[:8]
    async with factory() as session:
        user_repo = UserRepository(session)
        tenant_repo = TenantRepository(session)
        doc_repo = DocumentRepository(session)

        user = await user_repo.create(
            email=f"retr-{suffix}@example.com",
            password_hash=hash_password("StrongPass123!"),
        )
        tenant_a = await tenant_repo.create_tenant(
            name=f"Retrieval Tenant A {suffix}",
            slug=f"retr-tenant-a-{suffix}",
        )
        tenant_b = await tenant_repo.create_tenant(
            name=f"Retrieval Tenant B {suffix}",
            slug=f"retr-tenant-b-{suffix}",
        )
        await tenant_repo.create_membership(user_id=user.id, tenant_id=tenant_a.id, role="admin")

        doc_id = uuid.uuid4()
        content = (
            "# 1. Access Control Policy\n\n"
            "Every database operation and Qdrant vector search must be strictly scoped by tenant_id.\n\n"
            "# 2. Backup and Retention\n\n"
            "PostgreSQL is the authoritative system of record while Qdrant is a derived retrieval index."
        ).encode("utf-8")

        storage_key = await upload_original(
            tenant_id=tenant_a.id,
            document_id=doc_id,
            version=1,
            filename="access_policy.md",
            content=content,
            mime_type="text/markdown",
            uploaded_by=user.id,
        )

        await doc_repo.create(
            document_id=doc_id,
            tenant_id=tenant_a.id,
            title="Access Control Policy",
            file_name="access_policy.md",
            mime_type="text/markdown",
            storage_key=storage_key,
            uploader_id=user.id,
            status="processing",
        )
        tenant_a_id = tenant_a.id
        tenant_b_id = tenant_b.id
        await session.commit()

    try:
        await process_ingest_job(doc_id)

        # 1. Tenant B must receive ZERO results for Tenant A's indexed chunks (Guardrail #1)
        b_candidates = await hybrid_search(
            tenant_id=tenant_b_id,
            query="How is Qdrant vector search scoped by tenant_id?",
        )
        assert len(b_candidates) == 0

        # 2. Tenant A retrieves hybrid RRF candidates
        a_candidates = await hybrid_search(
            tenant_id=tenant_a_id,
            query="How is Qdrant vector search scoped by tenant_id?",
        )
        assert len(a_candidates) >= 1
        assert all(c.tenant_id == tenant_a_id for c in a_candidates)

        # 3. Rerank candidates using BAAI/bge-reranker-v2-m3
        reranked = await rerank_candidates(
            query="How is Qdrant vector search scoped by tenant_id?",
            candidates=a_candidates,
        )
        assert 1 <= len(reranked) <= 8

        # 4. Assemble parent contexts (deduplicated, max 3)
        async with factory() as session:
            assembled = await assemble_parent_contexts(
                session=session,
                tenant_id=tenant_a_id,
                reranked_chunks=reranked,
            )
            assert 1 <= len(assembled) <= 3
            assert assembled[0].document_title == "Access Control Policy"
    finally:
        await delete_document_points(tenant_id=tenant_a_id, document_id=doc_id)
        await delete_object(storage_key)