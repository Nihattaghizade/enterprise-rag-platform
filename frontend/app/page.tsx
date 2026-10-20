"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  FileText,
  Layers,
  Lock,
  MessageSquare,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Zap,
} from "lucide-react";
import { use_auth } from "@/lib/auth";
import {
  get_health_liveness,
  get_health_readiness,
  list_documents,
} from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { ApiRequestError } from "@/types/api";
import type { DocumentResponse } from "@/types/document";
import { CitationCard } from "@/components/chat/citation-card";
import { DocumentStatus } from "@/components/documents/document-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function AuthenticatedBentoDashboard() {
  const { session, canWriteDocuments, isAdmin } = use_auth();
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveness, setLiveness] = useState<string>("checking");
  const [readiness, setReadiness] = useState<string>("checking");

  const fetchWorkspaceData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [docList, liveRes, readyRes] = await Promise.all([
        list_documents(),
        get_health_liveness(),
        get_health_readiness(),
      ]);
      setDocuments(docList.items);
      setLiveness(liveRes.status);
      setReadiness(readyRes.status);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`${err.message} (${err.code})`);
      } else {
        setError("Failed to load workspace telemetry from backend.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaceData();
  }, [fetchWorkspaceData]);

  const readyCount = documents.filter((d) => d.status === "ready").length;
  const processingCount = documents.filter(
    (d) => d.status === "processing"
  ).length;
  const failedCount = documents.filter((d) => d.status === "failed").length;
  const totalChars = documents.reduce(
    (acc, doc) => acc + (doc.char_count ?? 0),
    0
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge variant="primary" className="mb-2 font-mono uppercase">
            Tenant Workspace Active
          </Badge>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Workspace Intelligence Bento
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time corpus status, Qdrant index readiness, and multi-tenant
            session scope derived from PostgreSQL.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={fetchWorkspaceData}>
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Now
          </Button>
          <Link href="/chat">
            <Button variant="primary" size="sm">
              <MessageSquare className="h-3.5 w-3.5" />
              Launch Grounded Chat
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchWorkspaceData}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Indexed Ready Documents</span>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </CardDescription>
              <CardTitle className="text-3xl font-mono">{readyCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {documents.length} total non-deleted records in tenant
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Ingestion Queue State</span>
                <Activity className="h-4 w-4 text-warning" />
              </CardDescription>
              <CardTitle className="text-3xl font-mono">
                {processingCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {failedCount} failed · auto-polls `/status`
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Extracted Corpus Volume</span>
                <Database className="h-4 w-4 text-primary" />
              </CardDescription>
              <CardTitle className="text-3xl font-mono">
                {formatNumber(totalChars)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Normalized characters indexed across sections
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Health & Readiness Probes</span>
                <Server className="h-4 w-4 text-primary" />
              </CardDescription>
              <CardTitle className="text-xl font-mono uppercase">
                /health: {liveness} · /ready: {readiness}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              PostgreSQL + Redis + Qdrant verified
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Tenant Documents</CardTitle>
              <CardDescription>
                Live records from `GET /api/v1/documents` scoped to your JWT
                membership.
              </CardDescription>
            </div>
            <Link href="/documents">
              <Button variant="outline" size="sm">
                View Full Table
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2.5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-2 font-medium text-sm">
                  Your tenant corpus is currently empty
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {canWriteDocuments
                    ? "Upload your first PDF, DOCX, PPTX, MD, HTML, or TXT document to start querying."
                    : "Ask a workspace admin or editor to upload documents to this tenant."}
                </p>
                {canWriteDocuments && (
                  <Link href="/documents" className="mt-4 inline-block">
                    <Button variant="primary" size="sm">
                      <UploadCloud className="h-3.5 w-3.5" />
                      Upload First Document
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {documents.slice(0, 6).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div className="min-w-0 pr-4">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="font-medium text-foreground hover:text-primary truncate block"
                      >
                        {doc.title}
                      </Link>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {doc.file_name} · v{doc.version} ·{" "}
                        {formatDateTime(doc.created_at)}
                      </p>
                    </div>
                    <DocumentStatus
                      documentId={doc.id}
                      initialStatus={doc.status}
                      autoPoll={doc.status === "processing"}
                      onStatusResolved={fetchWorkspaceData}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Authenticated Session Contract</CardTitle>
            <CardDescription>
              Derived from JWT claims and verified against PostgreSQL
              `memberships`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-md border border-border-subtle bg-surface-elevated p-3 space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">user_id:</span>
                <span className="truncate max-w-[180px]">
                  {session?.user_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">tenant_id:</span>
                <span className="truncate max-w-[180px]">
                  {session?.tenant_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">role:</span>
                <span className="uppercase text-primary font-bold">
                  {session?.role}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="font-semibold text-foreground">
                Role Capabilities (`backend/app/core/permissions.py`):
              </p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  Query `POST /api/v1/chat/stream` (60 req/min rate limit)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  List & inspect documents + presigned MinIO URLs
                </li>
                {canWriteDocuments && (
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    Upload, reindex (`202`), and delete documents
                  </li>
                )}
                {isAdmin && (
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    Manage tenants, members & inspect `/metrics`
                  </li>
                )}
              </ul>
            </div>

            {isAdmin && (
              <div className="pt-2">
                <Link href="/admin/tenants" className="block">
                  <Button variant="secondary" size="sm" className="w-full">
                    <Building2 className="h-3.5 w-3.5" />
                    Open Tenant & RBAC Console
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { isAuthenticated, isLoading } = use_auth();
  const [liveStatus, setLiveStatus] = useState<"ready" | "offline" | "probing">(
    "probing"
  );

  useEffect(() => {
    let active = true;
    Promise.all([get_health_liveness(), get_health_readiness()])
      .then(([l, r]) => {
        if (!active) return;
        setLiveStatus(
          l.status === "ok" && r.status === "ready" ? "ready" : "offline"
        );
      })
      .catch(() => {
        if (active) setLiveStatus("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-8">
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <AuthenticatedBentoDashboard />;
  }

  return (
    <div className="mesh-surface min-h-screen">
      {/* HERO SECTION */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20">
        <div className="flex flex-col items-start gap-6">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface-elevated px-3.5 py-1.5 text-xs shadow-panel">
            <span
              className={
                liveStatus === "ready"
                  ? "h-2 w-2 rounded-full bg-success"
                  : liveStatus === "probing"
                  ? "h-2 w-2 rounded-full bg-warning animate-pulse"
                  : "h-2 w-2 rounded-full bg-danger"
              }
            />
            <span className="font-mono">
              {liveStatus === "ready"
                ? "Backend Live: FastAPI + PostgreSQL + Qdrant + Redis + MinIO"
                : liveStatus === "probing"
                ? "Checking /health & /ready..."
                : "Backend Offline — Start Docker & FastAPI on :8000"}
            </span>
          </div>

          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl max-w-4xl leading-[1.08]">
            Multi-Tenant Enterprise RAG Engineered for{" "}
            <span className="text-primary">Verifiable Grounding.</span>
          </h1>

          <p className="max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Built strictly on asynchronous FastAPI, PostgreSQL authoritative
            metadata, private MinIO S3 storage, adaptive legal chunking, Qdrant
            hybrid dense (`BAAI/bge-m3` 1024-d) + sparse RRF retrieval, BGE
            cross-encoder reranking, and inline section citations.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link href="/login">
              <Button variant="primary" size="lg">
                Sign In to Tenant Workspace
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary" size="lg">
                Inspect Verified Pipeline
              </Button>
            </a>
          </div>
        </div>

        {/* REAL UI COMPONENT PRODUCT PREVIEW */}
        <div className="mt-14 rounded-xl border border-border bg-surface/90 p-5 sm:p-8 shadow-elevated backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-4 mb-6">
            <div className="flex items-center gap-2">
              <Badge variant="primary" className="font-mono">
                LIVE COMPONENT PREVIEW
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                POST /api/v1/chat/stream · SSE Events: citation → token → done
              </span>
            </div>
            <DocumentStatus initialStatus="ready" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 space-y-4 rounded-lg border border-border-subtle bg-surface-elevated p-4">
              <p className="font-mono text-xs uppercase text-muted-foreground">
                Grounded Assistant Output (`generation/prompts.py` contract)
              </p>
              <p className="text-sm leading-relaxed">
                Multi-factor authentication and role-based access control are
                mandatory for all privileged tenant operations{" "}
                <span className="inline-flex items-center rounded bg-primary-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary border border-primary/25">
                  [doc: Information Security Policy, section: 4.2]
                </span>
                . Cross-tenant queries are rejected before vector retrieval{" "}
                <span className="inline-flex items-center rounded bg-primary-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary border border-primary/25">
                  [doc: Tenant Isolation Standard, section: 2.1]
                </span>
                .
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle">
                <Badge variant="success">
                  <ShieldCheck className="h-3 w-3" />
                  grounded: true (confidence: 0.94)
                </Badge>
                <Badge variant="primary">
                  <Zap className="h-3 w-3" />
                  cache_hit: false
                </Badge>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-2.5">
              <p className="font-mono text-xs uppercase text-muted-foreground">
                Rendered by `components/chat/citation-card.tsx`
              </p>
              <CitationCard
                index={0}
                citation={{
                  doc_id: "00000000-0000-0000-0000-000000000001",
                  title: "Information Security Policy",
                  section_number: "4.2",
                  section_title: "Access Control & Authentication",
                  score: 0.914,
                }}
              />
              <CitationCard
                index={1}
                citation={{
                  doc_id: "00000000-0000-0000-0000-000000000002",
                  title: "Tenant Isolation Standard",
                  section_number: "2.1",
                  section_title: "Mandatory Qdrant Payload Filters",
                  score: 0.872,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* CAPABILITY CARDS (STRICTLY BACKEND-VERIFIED) */}
      <section className="mx-auto max-w-6xl px-6 py-14 border-t border-border-subtle">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-wider text-primary">
            Verified Backend Capabilities
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">
            Every Feature Maps 1:1 to Backend Source Code
          </h2>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <Layers className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Adaptive Legal Chunking</CardTitle>
              <CardDescription>
                `backend/app/ingestion/chunking.py:130-169`
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Sections `&lt;= 2,500` tokens use recursive parent (`1200` target,
              `1000–1400`) and child (`350` target, `300–400`, `50` overlap)
              windows. Sections `&gt; 2,500` tokens trigger semantic paragraph
              grouping by cosine similarity of embeddings.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Sparkles className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Hybrid Dense + Sparse RRF</CardTitle>
              <CardDescription>
                `backend/app/retrieval/hybrid_search.py:21-98`
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Queries Qdrant `chunks` collection with 1024-dim dense vectors and
              CRC32 sparse vectors, fuses top `60` candidates via Reciprocal Rank
              Fusion (`k=60`), reranks to top `8` children, and deduplicates up
              to `3` parent contexts.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <ShieldCheck className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Grounding & Citation Verifier</CardTitle>
              <CardDescription>
                `backend/app/generation/grounding.py:30-78`
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Validates lexical token overlap (`&gt;= 0.20`) and verifies that
              every `[doc: Title, section: X]` citation matches an assembled
              parent context, abstaining with `INSUFFICIENT_EVIDENCE_MESSAGE`
              when unsupported.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Database className="h-6 w-6 text-primary mb-1" />
              <CardTitle>MinIO S3 + 32 KB Parent Offload</CardTitle>
              <CardDescription>
                `backend/app/storage/s3_adapter.py:40-177`
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Stores originals in `rag-documents` up to `50 MB`. Parent contexts
              `&lt;= 32 KB` live inline in PostgreSQL `parent_contexts`; larger
              parents spill to MinIO and are transparently resolved at query
              time.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Lock className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Strict Tenant & RBAC Isolation</CardTitle>
              <CardDescription>
                `backend/app/api/deps.py:42-85`
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Tenant context is derived solely from verified JWT + PostgreSQL
              `Membership` (`admin`, `editor`, `viewer`). Every SQL query and
              Qdrant `Filter` enforces `tenant_id` and `is_active = true`.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Redis Caching, Locks & Queues</CardTitle>
              <CardDescription>
                `backend/app/tasks/queue.py:33-163`
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Caches query responses, embeddings, and rerank scores in Redis;
              enforces `60 req/min` chat rate limits; and coordinates background
              worker ingestion with per-document Redis locks and DLQ retry.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="mx-auto max-w-6xl px-6 py-14 border-t border-border-subtle"
      >
        <p className="font-mono text-xs uppercase tracking-wider text-primary">
          End-to-End Architecture
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold">
          How Ingestion & Query Execution Work
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Badge variant="primary" className="w-fit font-mono">
                FLOW 1 · ASYNC INGESTION (`202 Accepted`)
              </Badge>
              <CardTitle className="mt-2">
                Upload → MinIO → Worker → Qdrant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs text-muted-foreground font-mono">
              <p>1. POST /api/v1/documents validates MIME &amp; 50 MB limit</p>
              <p>2. Original uploaded to MinIO `tenants/&#123;tid&#125;/documents/&#123;did&#125;/original/v1/...`</p>
              <p>3. PostgreSQL `Document(status=&quot;processing&quot;)` + `AuditLog` committed</p>
              <p>4. Redis job queued on `rag:&#123;env&#125;:queue:ingestion`</p>
              <p>5. Worker parses, normalizes (`&gt;= 20` non-ws chars), splits sections, chunks parents/children</p>
              <p>6. Upserts 1024-d dense + sparse vectors into Qdrant `chunks` and marks `ready`</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Badge variant="primary" className="w-fit font-mono">
                FLOW 2 · STREAMING RAG (`text/event-stream`)
              </Badge>
              <CardTitle className="mt-2">
                Hybrid Search → Rerank → Grounded SSE
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs text-muted-foreground font-mono">
              <p>1. POST /api/v1/chat/stream checks 60/min Redis rate limit &amp; query cache</p>
              <p>2. Qdrant hybrid search (dense + sparse RRF) retrieves top 60 active tenant chunks</p>
              <p>3. Cross-encoder reranker scores and retains top 8 child chunks</p>
              <p>4. Context assembly resolves &amp; deduplicates up to 3 parent contexts</p>
              <p>5. Streams `event: citation` and live `event: token` chunks</p>
              <p>6. Runs `verify_grounding()`, logs `QueryLog`, and emits `event: done`</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECURITY & FAQ */}
      <section className="mx-auto max-w-6xl px-6 py-14 border-t border-border-subtle">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-primary">
              Security & Compliance
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold">
              Zero Cross-Tenant Leakage by Construction
            </h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Client-provided tenant identifiers never grant access on their
              own. Every API call resolves `AuthContext` from the signed JWT and
              live PostgreSQL `Membership` record. Cross-tenant resource probes
              return `404 Not Found` (`assert_tenant_access`) to prevent
              enumeration.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="font-semibold text-sm">
                Which file formats are supported in v1?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Text extracted from `.pdf`, `.docx`, `.pptx`, `.html`/`.htm`,
                `.md`, and `.txt` up to 50 MB (`52,428,800` bytes).
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="font-semibold text-sm">
                How does authentication work in the browser?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                `POST /api/v1/auth/login` returns JWT `access_token` and
                `refresh_token` in the JSON body AND sets `HttpOnly` cookies.
                On `401`, the frontend automatically calls `POST
                /api/v1/auth/refresh` and retries the request.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface py-8 px-6">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>
            Veritas Enterprise RAG Platform · v2 Architecture Baseline
          </span>
          <span className="font-mono">
            FastAPI · Next.js App Router · PostgreSQL · Qdrant · MinIO · Redis
          </span>
        </div>
      </footer>
    </div>
  );
}
