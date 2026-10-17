# Enterprise RAG Platform

Text-only, multi-tenant enterprise RAG application with secure tenant isolation, MinIO object storage, hybrid retrieval (`BAAI/bge-m3` dense + sparse fused with RRF), reranking (`BAAI/bge-reranker-v2-m3`), citations, evaluation, and observability.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the authoritative developer reference, folder layout, database schemas, and implementation guardrails.

## Core Stack

- **Backend:** FastAPI, async-first Python, SQLAlchemy (`postgresql+asyncpg`), Alembic
- **Frontend:** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui
- **AI Orchestration & Tracing:** LangChain & LangSmith
- **Databases & Storage:**
  - **PostgreSQL:** Authoritative metadata, users, tenants, memberships, documents, parent contexts, audit/query/usage logs
  - **Qdrant:** `chunks` collection with dense (1024-d) and sparse vectors
  - **MinIO:** Private `rag-documents` S3-compatible object storage
  - **Redis:** Query/embedding/rerank caches, rate limits, and ingestion queue support

## Operational Runbooks

- [Backup and Restore](./docs/runbooks/backup-restore.md)
- [Reindexing Procedure](./docs/runbooks/reindexing.md)