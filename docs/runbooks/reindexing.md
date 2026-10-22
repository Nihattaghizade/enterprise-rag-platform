# Runbook: Document & Collection Reindexing

## 1. Overview & Architecture

Per `ARCHITECTURE.md` Sections 5.4B, 6.3, and 15 (Guardrail #7), **Qdrant** is a derived retrieval index (`chunks` collection). The authoritative source of truth for documents resides in **PostgreSQL** (metadata & parent contexts) and **MinIO** (immutable source bytes).

Reindexing is required under the following scenarios:
1. **Document Version Updates:** A new revision of a policy or agreement is uploaded, incrementing `document_version`.
2. **Chunking & Ingestion Strategy Adjustments:** Modification of target parent tokens (1200), child tokens (350), or section threshold (2,500).
3. **Embedding / Retrieval Upgrades:** Upgrading model weights (`BAAI/bge-m3`), altering sparse vector algorithms, or adjusting RRF constants.
4. **Disaster Recovery Reconciliation:** Rebuilding vector indices from scratch after infrastructure failure or cluster migration.

---

## 2. Reindexing Permissions & API Endpoints

Reindexing can be invoked via REST API or backend services:

* **Endpoint:** `POST /api/v1/documents/{document_id}/reindex`
* **Response:** HTTP `202 Accepted` with payload:
  ```json
  {
    "document_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "processing"
  }
  ```
* **Authorized Roles:**
  * `superadmin`: Universal access across any workspace document.
  * `admin` / `editor`: Authorized for documents belonging to their active workspace.
  * `trial_viewer`: Permitted to reindex their allowed evaluation sandbox documents.
  * *(Standard `viewer` roles are strictly prohibited).*

---

## 3. Atomic Reindexing Lifecycle (Worker Sequence)

The ingestion worker (`backend/app/ingestion/worker.py`) processes reindexing jobs asynchronously following a strict zero-downtime atomic pipeline:

```text
[1. Acquire Lock] ──> [2. Fetch MinIO] ──> [3. Parse & Chunk] ──> [4. BGE-M3 Embed]
        │
        ▼
[5. Qdrant Upsert vN] ──> [6. Deactivate v(N-1)] ──> [7. Invalidate Cache] ──> [8. Release Lock]
```

1. **Distributed Concurrency Lock:**
   * Acquires Redis distributed lock: `rag:{env}:lock:document:{document_id}` with a 300s TTL.
   * Prevents concurrent ingestion or reindexing collisions on the same document.
2. **Fetch Source Object:**
   * Retrieves original document bytes from MinIO bucket `rag-documents` using `document.storage_key`.
3. **Parse, Normalize & Plan Chunks:**
   * Resolves MIME type (PDF, DOCX, PPTX, HTML, MD, TXT).
   * Normalizes unicode, extracts document sections, and computes chunk boundaries:
     * Parent context target: 1,000–1,400 tokens (default 1,200).
     * Child chunk target: 300–400 tokens (default 350) with 50-token sliding overlap.
     * Sections exceeding 2,500 tokens trigger semantic section subdivision.
4. **Generate Embeddings:**
   * Computes 1024-dimensional dense vectors via `BAAI/bge-m3`.
   * Computes lexical sparse token vectors (BM25 equivalent) for hybrid keyword retrieval.
5. **Zero-Downtime Qdrant Upsert:**
   * Upserts new chunk points into Qdrant `chunks` collection tagged with:
     * `tenant_id` (enforces strict isolation filter).
     * `doc_id` and `parent_id`.
     * `document_version = N`.
     * `is_active = true`.
6. **Retire Prior Version Points:**
   * Deactivates or purges prior-version points in Qdrant matching `tenant_id AND doc_id AND document_version < N`.
7. **Relational Database Synchronization:**
   * Updates `parent_contexts` in PostgreSQL with updated summaries and token counts.
   * Updates `documents.status = 'ready'` and records audit trail via `AuditRepository`.
8. **Cache Invalidation & Lock Release:**
   * Purges Redis query-answer caches for the workspace: `rag:{env}:cache:query:{tenant_id}:*`.
   * Releases the distributed Redis lock.

---

## 4. Cascading Deletion & Cross-Tier Purge

When a document or entire workspace is deleted, the system executes a four-tier cascading purge:

```python
# Executed via document_service.delete_document()
await delete_document_points(qdrant_client, tenant_id=tenant_id, document_id=doc.id)
await delete_object(bucket="rag-documents", key=doc.storage_key)
await rclient.delete(f"rag:{env}:cache:query:{tenant_id}:*")
await doc_repo.delete(document_id=doc.id)
```

1. **Qdrant Vector Purge:** Points matching `tenant_id == {tenant_id} AND doc_id == {document_id}` are permanently removed.
2. **MinIO Object Removal:** Original uploaded file and stored parent-context artifacts are deleted.
3. **Redis Cache Eviction:** All cached hybrid query results referencing the tenant are invalidated.
4. **PostgreSQL Relational Cascade:** `parent_contexts` records and `documents` record are deleted, accompanied by an `AuditLog` entry.

---

## 5. Full Tenant / Platform Bulk Reindex Script

To re-index an entire tenant or rebuild all workspace indices following model updates:

```powershell
# From backend directory:
cd backend
.\.venv\Scripts\python.exe -c "
import asyncio, uuid
from app.db.session import create_engine, get_session_factory
from app.db.repositories.documents import DocumentRepository
from app.tasks.queue import enqueue_reindex

async def bulk_reindex(tenant_id: uuid.UUID):
    create_engine()
    async with get_session_factory()() as session:
        repo = DocumentRepository(session)
        docs = await repo.list_documents(tenant_id, status='ready')
        for doc in docs:
            job = await enqueue_reindex(tenant_id, doc.id)
            print(f'Enqueued doc {doc.id} ({doc.title}) -> job {job}')

asyncio.run(bulk_reindex(uuid.UUID('11111111-1111-1111-1111-111111111111')))
"
```

---

## 6. Observability & LangSmith Evaluation

* **Job Progress:** Monitor ingestion progress via Redis keys `rag:{env}:job:{job_id}` and check the dead-letter queue `rag:{env}:queue:dead_letter` for failed items.
* **LangSmith Traces:** Every reindexing job records token consumption, chunking latency, and embedding generation metrics under the project trace configured in `LANGSMITH_PROJECT`.
* **Grounding & Recall Verification:** Validate post-reindex retrieval performance on `/chat` or run the evaluation test suite:
  ```powershell
  cd backend; .\.venv\Scripts\pytest.exe tests/integration/test_retrieval_hybrid.py
  ```
