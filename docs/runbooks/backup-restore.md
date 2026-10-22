# Runbook: Backup, Restore & Disaster Recovery

## 1. Ownership & System of Record Architecture

Per `ARCHITECTURE.md` Section 5.4E, the platform enforces a strict four-tier data persistence and recovery hierarchy:

| Tier | Component | Role & Authority | Persistence | Recovery Strategy |
|---|---|---|---|---|
| **Tier 1 (Authoritative)** | **PostgreSQL** (`rag-postgres`) | Source of Truth for identity, multi-tenancy, RBAC, document lifecycle metadata, parent contexts, audit logs, query logs, and usage quotas. | Persistent volume (`pgdata`) | Point-in-Time Recovery (PITR) / Custom-format binary pg_dump (`-Fc`) |
| **Tier 2 (Source Objects)** | **MinIO S3** (`rag-minio`) | Authoritative immutable repository for raw uploaded files (`rag-documents` bucket) and large parent-context blobs. | Persistent volume (`minio_data`) | Object versioning + `mc mirror --preserve` replication |
| **Tier 3 (Derived Index)** | **Qdrant** (`rag-qdrant`) | Derived retrieval index containing BAAI/bge-m3 dense (1024-dim) and sparse vectors with tenant payload filters. | Persistent volume (`qdrant_data`) | Collection snapshot restore OR deterministic re-ingestion from Tier 1 + Tier 2 |
| **Tier 4 (Ephemeral State)** | **Redis** (`rag-redis`) | Ephemeral semantic query caches, embedding caches, distributed locks, and rate limit token buckets. | In-memory with optional AOF | Flushed post-restore; zero persistent dependencies |

---

## 2. Production Backup Procedures

### 2.1 PostgreSQL Authoritative Dump
Perform consistent binary backups using PostgreSQL custom format (`-Fc`), enabling parallel restores, compression, and selective table reconstruction:

```bash
# 1. Full database dump
docker exec rag-postgres pg_dump \
  -U rag_user \
  -Fc \
  -b \
  -v \
  -f /tmp/backup_postgres_$(date +%Y%m%d_%H%M%S).dump \
  rag_platform

# 2. Copy dump artifact out of container to host backup storage
docker cp rag-postgres:/tmp/backup_postgres_*.dump ./backups/
```

### 2.2 MinIO Storage Object Replication
Preserve the private `rag-documents` bucket including object versions, upload metadata, and custom S3 headers:

```bash
# Configure MinIO client alias (run once per environment)
mc alias set local http://localhost:9000 minioadmin minioadmin123

# Synchronize/mirror all workspace documents with timestamps and metadata
mc mirror --preserve --overwrite local/rag-documents ./backups/minio/$(date +%F)/rag-documents
```

### 2.3 Qdrant Collection Snapshot
Capture point states and indexing structures for sub-minute disaster recovery:

```bash
# Trigger point collection snapshot for the active 'chunks' collection
curl -fsSL -X POST "http://localhost:6333/collections/chunks/snapshots" \
  -H "Content-Type: application/json"

# List snapshots and download the latest archive
curl -fsSL "http://localhost:6333/collections/chunks/snapshots"
```

---

## 3. Database Reset & Truncation Workflows

### 3.1 Single CLI Command: Truncate All PostgreSQL Tables
When performing a clean test reset or preparing for database re-seeding, all relational tables must be cleared in the correct order respecting foreign key constraints. 

Execute this single command in PowerShell or Bash:

```bash
# Truncate all relational platform tables with cascading foreign keys
docker exec -i rag-postgres psql -U rag_user -d rag_platform -c \
  "TRUNCATE TABLE parent_contexts, documents, query_logs, usage_records, audit_logs, memberships, users, tenants CASCADE;"
```

### 3.2 Python CLI Execution: Database Wipe & Automated Seeding
To completely seed the system with platform superadmin, enterprise tenants, trial sandboxes, and test document workflows, execute the seed script:

```powershell
# From the backend root directory (virtual environment activated):
cd backend
.\.venv\Scripts\python.exe seed_data.py
```

*Note: The platform provides `backend/seed_data.py` (which mirrors `backend/scripts/seed_data.py`) to guarantee execution regardless of execution working directory.*

The seeding pipeline provisions:
1. **Platform Root Workspace (`00000000-0000-0000-0000-000000000001`):** `Platform Administration` exclusively for superadmins (`superadmin@enterprise.internal`).
2. **Evaluation Sandbox Workspace (`00000000-0000-0000-0000-000000000002`):** `Trial Sandbox (Test)` with automatic 2-file / 10-query caps for evaluation accounts (`eval.tester1@sample.org`).
3. **Enterprise Tenants:** Acme Global Tech, Apex Financial, BioHealth Sciences, CyberShield Defense, Nova Legal, AeroSpace Dynamics, GreenGrid, and OmniRetail.
4. **Pending Approvals Queue:** Proposed workspaces (Vanguard Logistics, Nexus Quantum) and candidate applicants for superadmin governance testing.

---

## 4. Full Restoration & Reconciliation Lifecycle

In a disaster recovery scenario, systems must be restored strictly in Tier Order:

```text
[Step 1: PostgreSQL] ──> [Step 2: MinIO S3] ──> [Step 3: Qdrant Vector] ──> [Step 4: Redis Flush]
  Authoritative DB          Raw Documents          Vector Indices            Clear Stale Caches
```

### Step 1: Restore PostgreSQL
```bash
# Drop existing connections and restore authoritative schema + records with --clean
docker exec -i rag-postgres pg_restore \
  -U rag_user \
  -d rag_platform \
  --clean \
  --if-exists \
  -v < ./backups/backup_postgres.dump
```

### Step 2: Restore MinIO S3 Documents
```bash
# Mirror source files back to MinIO bucket
mc mirror --preserve ./backups/minio/latest/rag-documents local/rag-documents
```

### Step 3: Rebuild or Recover Qdrant Vector Index
Choose one of the following approaches depending on snapshot availability:

* **Approach A (Fast - From Snapshot):**
  ```bash
  # Restore Qdrant snapshot directly via REST API
  curl -X POST "http://localhost:6333/collections/chunks/snapshots/upload?priority=snapshot" \
    -H "Content-Type: multipart/form-data" \
    -F "snapshot=@chunks-snapshot.snapshot"
  ```
* **Approach B (Reconcile - Re-index from Source):**
  If Qdrant storage was corrupted or model dimensions changed, trigger reindexing across all active documents. See [`reindexing.md`](file:///C:/Users/NihatTaghizadeNovumL/Desktop/enterprise-rag-platform/docs/runbooks/reindexing.md).

### Step 4: Flush Redis Ephemeral Caches
Guarantee that zero stale query answers, invalidated chunk keys, or defunct rate limit tokens persist:

```bash
docker exec rag-redis redis-cli FLUSHDB
```

---

## 5. Post-Recovery Verification Checklist

Verify system health across all four storage and service boundaries:

- [ ] **Liveness & Readiness Probes:**
  `curl -fsSL http://localhost:8000/health && curl -fsSL http://localhost:8000/ready`
- [ ] **Superadmin Telemetry Verification:**
  Sign in as `superadmin@enterprise.internal` and verify the **Platform Superadmin Console** reports matching database metrics, active tenant counts, and healthy Qdrant vector counts.
- [ ] **Tenant Isolation Integrity:**
  Run the integration test suite:
  ```powershell
  cd backend; .\.venv\Scripts\pytest.exe tests/integration/test_tenant_isolation_boundary.py
  ```
- [ ] **End-to-End Chat & Citation Flow:**
  Submit a test query on `/chat` and verify streaming tokens and inline section citations resolve correctly.
