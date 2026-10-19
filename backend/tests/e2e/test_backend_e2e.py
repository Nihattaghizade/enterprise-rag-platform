import uuid
from collections.abc import AsyncIterator
from typing import Any

from httpx import ASGITransport, AsyncClient
from langchain_core.language_models.chat_models import SimpleChatModel
from langchain_core.messages import AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGenerationChunk

from app.api import chat as chat_api
from app.core.security import hash_password
from app.db.repositories.tenants import TenantRepository
from app.db.repositories.users import UserRepository
from app.db.session import create_engine, get_session_factory
from app.ingestion.worker import process_ingest_job
from app.main import app


class GroundedTestChatModel(SimpleChatModel):
    """Deterministic LangChain chat model for E2E SSE streaming verification."""

    @property
    def _llm_type(self) -> str:
        return "grounded_test_chat_model"

    def _call(self, messages: list[BaseMessage], stop: Any = None, **kwargs: Any) -> str:
        return "All Qdrant searches are scoped by tenant_id [doc: Enterprise Security Guide, section: 1]."

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: Any = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        text = "All Qdrant searches are scoped by tenant_id [doc: Enterprise Security Guide, section: 1]."
        for word in text.split(" "):
            yield ChatGenerationChunk(message=AIMessageChunk(content=word + " "))


async def test_full_backend_e2e_flow(monkeypatch) -> None:
    """Section 16 E2E: Login -> Upload (202) -> Processing -> Worker Ingest -> Chat SSE Stream + Citations -> Cross-Tenant Rejection -> Delete."""
    create_engine()
    factory = get_session_factory()
    suffix = uuid.uuid4().hex[:8]

    async with factory() as session:
        user_repo = UserRepository(session)
        tenant_repo = TenantRepository(session)

        user_a = await user_repo.create(
            email=f"admin-a-{suffix}@example.com",
            password_hash=hash_password("AdminPass123!"),
        )
        user_b = await user_repo.create(
            email=f"admin-b-{suffix}@example.com",
            password_hash=hash_password("AdminPass123!"),
        )
        tenant_a = await tenant_repo.create_tenant(name=f"Tenant A {suffix}", slug=f"e2e-a-{suffix}")
        tenant_b = await tenant_repo.create_tenant(name=f"Tenant B {suffix}", slug=f"e2e-b-{suffix}")

        await tenant_repo.create_membership(user_id=user_a.id, tenant_id=tenant_a.id, role="admin")
        await tenant_repo.create_membership(user_id=user_b.id, tenant_id=tenant_b.id, role="admin")
        await session.commit()

        email_a = user_a.email
        email_b = user_b.email

    # Patch get_chat_model in llm module so E2E test does not require a live OpenAI billing key
    monkeypatch.setattr("app.generation.llm.get_chat_model", lambda *a, **kw: GroundedTestChatModel())

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Health & Readiness checks
        health_res = await client.get("/health")
        assert health_res.status_code == 200
        ready_res = await client.get("/ready")
        assert ready_res.status_code == 200

        # 2. Login as Tenant A Admin
        login_a = await client.post(
            "/api/v1/auth/login",
            json={"email": email_a, "password": "AdminPass123!"},
        )
        assert login_a.status_code == 200
        token_a = login_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # 3. Login as Tenant B Admin
        login_b = await client.post(
            "/api/v1/auth/login",
            json={"email": email_b, "password": "AdminPass123!"},
        )
        assert login_b.status_code == 200
        token_b = login_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 4. Upload document as Tenant A (Must return 202 Accepted per Guardrail #2)
        md_content = (
            "# 1. Isolation Rules\n\n"
            "Every database operation and Qdrant search is scoped by tenant_id."
        ).encode("utf-8")
        upload_res = await client.post(
            "/api/v1/documents",
            headers=headers_a,
            files={"file": ("security_guide.md", md_content, "text/markdown")},
            data={"title": "Enterprise Security Guide"},
        )
        assert upload_res.status_code == 202
        upload_payload = upload_res.json()
        doc_id = uuid.UUID(upload_payload["document"]["id"])
        assert upload_payload["status"] == "processing"

        # 5. Check processing status before worker runs
        status_res = await client.get(f"/api/v1/documents/{doc_id}/status", headers=headers_a)
        assert status_res.status_code == 200
        assert status_res.json()["status"] == "processing"

        # 6. Execute background worker ingestion
        await process_ingest_job(doc_id)

        # 7. Verify status transitioned to 'ready'
        ready_doc_res = await client.get(f"/api/v1/documents/{doc_id}/status", headers=headers_a)
        assert ready_doc_res.status_code == 200
        assert ready_doc_res.json()["status"] == "ready"

        # 8. Attempted cross-tenant access by Tenant B must be rejected with 404 (structured error contract)
        cross_res = await client.get(f"/api/v1/documents/{doc_id}", headers=headers_b)
        assert cross_res.status_code == 404
        err_body = cross_res.json()
        assert set(err_body.keys()) == {"code", "message", "details", "request_id"}

        # 9. Stream chat query as Tenant A and verify SSE citation + token + done events
        chat_res = await client.post(
            "/api/v1/chat/stream",
            headers=headers_a,
            json={"query": "How are Qdrant searches scoped?"},
        )
        assert chat_res.status_code == 200
        assert "text/event-stream" in chat_res.headers["content-type"]
        sse_body = chat_res.text
        assert "event: citation" in sse_body
        assert "Enterprise Security Guide" in sse_body
        assert "event: token" in sse_body
        assert "event: done" in sse_body

        # 10. Delete document as Tenant A
        del_res = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers_a)
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "deleted"