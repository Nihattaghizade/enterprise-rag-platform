import uuid

from qdrant_client.http import models as qmodels

from app.core.security import hash_password
from app.db.repositories.documents import DocumentRepository
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.db.session import create_engine, get_session_factory
from app.ingestion.index import delete_document_points, get_qdrant_client
from app.ingestion.worker import process_ingest_job, process_reindex_job
from app.storage.s3_adapter import delete_object, upload_original


async def test_end_to_end_ingest_and_reindex_worker_flow() -> None:
    """Verify Upload -> MinIO -> Postgres -> Worker -> Qdrant chunks -> Reindex -> Delete."""
    create_engine()
    factory = get_session_factory()

    suffix = uuid.uuid4().hex[:8]
    async with factory() as session:
        user_repo = UserRepository(session)
        tenant_repo = TenantRepository(session)
        doc_repo = DocumentRepository(session)

        user = await user_repo.create(
            email=f"ingest-{suffix}@example.com",
            password_hash=hash_password("StrongPass123!"),
        )
        tenant = await tenant_repo.create_tenant(
            name=f"Ingest Tenant {suffix}",
            slug=f"ingest-tenant-{suffix}",
        )
        await tenant_repo.create_membership(user_id=user.id, tenant_id=tenant.id, role="admin")

        doc_id = uuid.uuid4()
        sample_content = (
            "# 1. Data Retention Policy\n\n"
            "All enterprise tenant documents are stored in MinIO and indexed in Qdrant with strict tenant_id filters.\n\n"
            "# 2. Retrieval Architecture\n\n"
            "Child retrieval chunks use BAAI/bge-m3 dense and sparse vectors fused with Reciprocal Rank Fusion."
        ).encode("utf-8")

        storage_key = await upload_original(
            tenant_id=tenant.id,
            document_id=doc_id,
            version=1,
            filename="retention_policy.md",
            content=sample_content,
            mime_type="text/markdown",
            uploaded_by=user.id,
        )

        doc = await doc_repo.create(
            document_id=doc_id,
            tenant_id=tenant.id,
            title="Data Retention Policy",
            file_name="retention_policy.md",
            mime_type="text/markdown",
            storage_key=storage_key,
            uploader_id=user.id,
            status="processing",
        )
        tenant_id = tenant.id
        await session.commit()

    # 1. Execute ingestion worker job
    await process_ingest_job(doc_id)

    # 2. Verify Document status is 'ready' in PostgreSQL
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        ready_doc = await doc_repo.get_by_id(tenant_id=tenant_id, document_id=doc_id)
        assert ready_doc is not None
        assert ready_doc.status == "ready"
        assert ready_doc.version == 1
        assert (ready_doc.char_count or 0) > 50

    # 3. Verify points exist in Qdrant 'chunks' collection with mandatory tenant_id filter
    qclient = get_qdrant_client()
    try:
        count_res = await qclient.count(
            collection_name="chunks",
            count_filter=qmodels.Filter(
                must=[
                    qmodels.FieldCondition(key="tenant_id", match=qmodels.MatchValue(value=str(tenant_id))),
                    qmodels.FieldCondition(key="doc_id", match=qmodels.MatchValue(value=str(doc_id))),
                    qmodels.FieldCondition(key="is_active", match=qmodels.MatchValue(value=True)),
                ]
            ),
            exact=True,
        )
        assert count_res.count >= 2

        # 4. Execute reindex worker job and verify version increments to 2
        await process_reindex_job(doc_id)

        async with factory() as session:
            doc_repo = DocumentRepository(session)
            reindexed_doc = await doc_repo.get_by_id(tenant_id=tenant_id, document_id=doc_id)
            assert reindexed_doc is not None
            assert reindexed_doc.status == "ready"
            assert reindexed_doc.version == 2

        # Cleanup Qdrant points and MinIO object
        await delete_document_points(tenant_id=tenant_id, document_id=doc_id, client=qclient)
        after_delete = await qclient.count(
            collection_name="chunks",
            count_filter=qmodels.Filter(
                must=[
                    qmodels.FieldCondition(key="tenant_id", match=qmodels.MatchValue(value=str(tenant_id))),
                    qmodels.FieldCondition(key="doc_id", match=qmodels.MatchValue(value=str(doc_id))),
                ]
            ),
            exact=True,
        )
        assert after_delete.count == 0
    finally:
        await qclient.close()
        await delete_object(storage_key)