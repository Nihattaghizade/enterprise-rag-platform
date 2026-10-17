# Runbook: Document & Collection Reindexing

## 1. Overview

Per `ARCHITECTURE.md` Sections 5.4B, 6.3, and 15 (Guardrail #7), Qdrant is a derived retrieval index (`chunks` collection). Reindexing is required when:
- A document is updated or replaced with a new version (`document_version` incremented).
- Embedding model (`BAAI/bge-m3`) or chunking strategy parameters are updated after LangSmith evaluation.
- Recovering the Qdrant `chunks` index from PostgreSQL + MinIO source objects.

## 2. Single-Document Reindex Lifecycle

1. Request reindex via `POST /api/v1/documents/{id}/reindex` (or `document_service.request_reindex()`).
2. A distributed lock `rag:{env}:lock:document:{document_id}` prevents concurrent duplicate ingestion/reindex jobs.
3. The job is queued on `rag:{env}:queue:ingestion` and executed by `ingestion/worker.py:process_reindex_job()`.
4. Worker execution sequence:
   - Fetch original source object from MinIO (`documents.storage_key`).
   - Parse -> normalize -> split into sections -> build chunk plan (recursive + semantic for sections > 2,500 tokens).
   - Persist new `parent_contexts` records and batch-generate `BAAI/bge-m3` dense + sparse vectors.
   - Upsert new-version points into Qdrant `chunks` with `tenant_id`, `doc_id`, `parent_id`, `document_version`, and `is_active=true`.
   - Validate upsert completion, then deactivate (`is_active=false`) or delete prior version points in Qdrant filtered by `tenant_id AND doc_id`.
   - Invalidate tenant query cache keys (`rag:{env}:cache:query:{tenant_id}:*`).
   - Record audit log event (`AuditLog`).

## 3. Full Tenant / Platform Reindex

1. Query PostgreSQL `documents` filtered by `tenant_id` and `status = 'ready'`.
2. Enqueue reindex jobs in controlled batches respecting `rag:{env}:quota:concurrent_jobs:{tenant_id}`.
3. Monitor job status keys (`rag:{env}:job:{job_id}`) and dead-letter queue (`rag:{env}:queue:dead_letter`).
4. Verify retrieval recall and citation grounding in LangSmith before switching traffic if migrating collection settings.