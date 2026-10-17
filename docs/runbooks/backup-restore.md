# Runbook: Backup and Restore

## 1. Ownership & System of Record Order

Per `ARCHITECTURE.md` Section 5.4E:
1. **PostgreSQL** is the authoritative source of truth for tenants, users, memberships, documents, parent contexts, audit logs, query logs, and usage records.
2. **MinIO (`rag-documents` bucket)** stores original uploaded source objects and optional large parent-context objects referenced by PostgreSQL keys.
3. **Qdrant (`chunks` collection)** is a derived retrieval index that can be snapshot-restored or rebuilt from PostgreSQL + MinIO.
4. **Redis** holds ephemeral caches, rate-limit counters, and job state; it does not hold source-of-truth data.

## 2. Backup Procedure

### 2.1 PostgreSQL Backup
```bash
docker exec rag-postgres pg_dump -U rag_user -Fc rag_platform > backup_postgres_$(date +%F).dump
```

### 2.2 MinIO Bucket Backup
Mirror the private `rag-documents` bucket preserving object versions and metadata tags:
```bash
mc mirror --preserve local/rag-documents ./backup_minio_$(date +%F)/rag-documents
```

### 2.3 Qdrant Collection Snapshot (Optional / Fast Recovery)
```bash
curl -X POST "http://localhost:6333/collections/chunks/snapshots"
```

## 3. Restore & Reconciliation Procedure

1. **Restore PostgreSQL** first so authoritative metadata and document lifecycle states are consistent:
   ```bash
   docker exec -i rag-postgres pg_restore -U rag_user -d rag_platform --clean < backup_postgres.dump
   ```
2. **Restore MinIO (`rag-documents`)** objects so all `documents.storage_key` and `parent_contexts.storage_key` references resolve.
3. **Restore or Rebuild Qdrant (`chunks`)**:
   - Either restore the `chunks` collection snapshot, or trigger document reindexing (see `docs/runbooks/reindexing.md`) for active `ready` documents.
4. **Flush Redis** ephemeral query caches (`rag:{env}:cache:query:*`) to guarantee no stale cross-version responses.