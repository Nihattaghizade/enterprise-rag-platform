"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Database,
  FileSearch,
  FileText,
  Layers,
  Lock,
  MessageSquare,
  RefreshCw,
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
  const [copiedTenantId, setCopiedTenantId] = useState(false);

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
        setError(err.message);
      } else {
        setError("Unable to load workspace telemetry right now.");
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
  const isHealthy = liveness === "ok" && readiness === "ready";

  const handleCopyTenantId = async () => {
    if (!session?.tenant_id) return;
    await navigator.clipboard.writeText(session.tenant_id);
    setCopiedTenantId(true);
    window.setTimeout(() => setCopiedTenantId(false), 1800);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="primary" className="uppercase tracking-wider">
              Workspace Overview
            </Badge>
            <span className="text-xs text-muted-foreground capitalize">
              · {session?.role} Access
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Knowledge Intelligence Hub
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor indexed knowledge sources, active processing pipelines, and
            launch verified AI research sessions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={fetchWorkspaceData}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          {canWriteDocuments && (
            <Link href="/documents">
              <Button variant="secondary" size="sm">
                <UploadCloud className="h-3.5 w-3.5" />
                Upload Documents
              </Button>
            </Link>
          )}
          <Link href="/chat">
            <Button variant="primary" size="sm">
              <MessageSquare className="h-3.5 w-3.5" />
              Open AI Assistant
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchWorkspaceData}>
            Try Again
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="transition-all hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Searchable Documents</span>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </CardDescription>
              <CardTitle className="text-3xl font-display">
                {readyCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {documents.length} total documents in workspace
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Active Indexing Queue</span>
                <Activity className="h-4 w-4 text-warning" />
              </CardDescription>
              <CardTitle className="text-3xl font-display">
                {processingCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {failedCount > 0
                ? `${failedCount} require attention`
                : "Live status updates enabled"}
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Indexed Knowledge Volume</span>
                <Database className="h-4 w-4 text-primary" />
              </CardDescription>
              <CardTitle className="text-3xl font-display">
                {formatNumber(totalChars)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Characters structured across document sections
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Platform Availability</span>
                <ShieldCheck
                  className={`h-4 w-4 ${
                    isHealthy ? "text-success" : "text-warning"
                  }`}
                />
              </CardDescription>
              <CardTitle className="text-xl font-display">
                {isHealthy ? "All Systems Ready" : "Service Degraded"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Search index, storage, and AI engine online
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Knowledge Sources</CardTitle>
              <CardDescription>
                Documents uploaded to your isolated workspace environment.
              </CardDescription>
            </div>
            <Link href="/documents">
              <Button variant="outline" size="sm">
                View All Documents
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2.5">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <FileText className="mx-auto h-9 w-9 text-muted-foreground/50" />
                <p className="mt-3 font-medium text-sm text-foreground">
                  No documents in your knowledge base yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                  {canWriteDocuments
                    ? "Upload policy manuals, contracts, technical specs, or research reports (PDF, DOCX, PPTX, Markdown, HTML, TXT) to begin asking grounded questions."
                    : "Ask a workspace administrator or editor to upload documents to this workspace."}
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
              <div className="divide-y divide-border-subtle max-h-[350px] overflow-y-auto pr-1">
                {documents.slice(0, 15).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-3.5 text-sm"
                  >
                    <div className="min-w-0 pr-4">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="font-medium text-foreground hover:text-primary truncate block transition-colors"
                      >
                        {doc.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {doc.file_name} · Version {doc.version} ·{" "}
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
            <CardTitle>Workspace Access & Security</CardTitle>
            <CardDescription>
              Your active session profile and workspace permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="rounded-xl border border-border-subtle bg-surface-elevated p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Signed in as</span>
                <span className="font-medium text-foreground truncate max-w-[180px]">
                  {session?.email || "Authenticated User"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Access Role</span>
                <Badge variant="primary" className="capitalize">
                  {session?.role}
                </Badge>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border-subtle">
                <span className="text-muted-foreground">Workspace ID</span>
                <button
                  type="button"
                  onClick={handleCopyTenantId}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] text-foreground hover:text-primary transition-colors"
                  title="Copy full Workspace ID"
                >
                  <span>{session?.tenant_id.slice(0, 12)}…</span>
                  {copiedTenantId ? (
                    <Check className="h-3 w-3 text-success" />
                  ) : (
                    <Copy className="h-3 w-3 opacity-70" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <p className="font-semibold text-foreground">
                Included with your role:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  Interactive AI research with verified section citations
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  Browse knowledge base and download source files
                </li>
                {canWriteDocuments && (
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    Upload, classify, re-index, and remove documents
                  </li>
                )}
                {isAdmin && (
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    Provision workspaces, manage team roles, and view telemetry
                  </li>
                )}
              </ul>
            </div>

            {isAdmin && (
              <div className="pt-2">
                <Link href="/admin/tenants" className="block">
                  <Button variant="secondary" size="sm" className="w-full">
                    <Building2 className="h-3.5 w-3.5" />
                    Manage Workspaces & Team
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
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
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
          <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface-elevated/90 px-4 py-1.5 text-xs shadow-panel backdrop-blur-sm">
            <span
              className={
                liveStatus === "ready"
                  ? "h-2 w-2 rounded-full bg-success"
                  : liveStatus === "probing"
                  ? "h-2 w-2 rounded-full bg-warning animate-pulse"
                  : "h-2 w-2 rounded-full bg-danger"
              }
            />
            <span className="font-medium text-foreground">
              {liveStatus === "ready"
                ? "Veritas Enterprise Intelligence · All Systems Operational"
                : liveStatus === "probing"
                ? "Checking platform status..."
                : "Platform Services Offline"}
            </span>
          </div>

          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl max-w-4xl leading-[1.08] text-foreground">
            Enterprise Knowledge Intelligence Built on{" "}
            <span className="text-primary">Verifiable Proof.</span>
          </h1>

          <p className="max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Transform complex policies, legal agreements, and technical
            documentation into an instant, citation-backed research assistant.
            Every answer is strictly grounded in your organization’s private
            workspace documents—or abstains when evidence is absent.
          </p>

          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            <Link href="/login">
              <Button variant="primary" size="lg">
                Sign In to Workspace
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary" size="lg">
                Explore How It Works
              </Button>
            </a>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3 w-full max-w-3xl">
            <div className="rounded-xl border border-border-subtle bg-surface/70 px-4 py-3 backdrop-blur-sm">
              <p className="font-display text-lg font-bold text-foreground">
                100% Citation-Backed
              </p>
              <p className="text-xs text-muted-foreground">
                Inline document & section references on every claim
              </p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface/70 px-4 py-3 backdrop-blur-sm">
              <p className="font-display text-lg font-bold text-foreground">
                Strict Tenant Isolation
              </p>
              <p className="text-xs text-muted-foreground">
                Dedicated workspace boundaries across storage & search
              </p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface/70 px-4 py-3 backdrop-blur-sm">
              <p className="font-display text-lg font-bold text-foreground">
                Hybrid Neural Search
              </p>
              <p className="text-xs text-muted-foreground">
                Semantic + exact keyword fusion with neural reranking
              </p>
            </div>
          </div>
        </div>

        {/* INTERACTIVE PRODUCT SHOWCASE */}
        <div className="mt-14 rounded-2xl border border-border bg-surface/90 p-5 sm:p-8 shadow-elevated backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-4 mb-6">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 mr-2">
                <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
              </div>
              <Badge variant="primary">Interactive Research Preview</Badge>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Real-time streaming synthesis with section-level verification
              </span>
            </div>
            <DocumentStatus initialStatus="ready" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 space-y-4 rounded-xl border border-border-subtle bg-surface-elevated p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Verified Assistant Response
                </span>
                <span className="text-[11px] text-muted-foreground">
                  2 sources cited
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground">
                Multi-factor authentication and role-based access controls are
                mandatory for all privileged workspace operations{" "}
                <span className="inline-flex items-center rounded-md bg-primary-muted px-2 py-0.5 font-mono text-[11px] font-medium text-primary border border-primary/25">
                  [doc: Information Security Policy, section: 4.2]
                </span>
                . Furthermore, every search query is cryptographically scoped to
                your active organization workspace so data never crosses tenant
                boundaries{" "}
                <span className="inline-flex items-center rounded-md bg-primary-muted px-2 py-0.5 font-mono text-[11px] font-medium text-primary border border-primary/25">
                  [doc: Workspace Isolation Standard, section: 2.1]
                </span>
                .
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border-subtle">
                <Badge variant="success">
                  <ShieldCheck className="h-3 w-3" />
                  Verified Grounding (94% Confidence)
                </Badge>
                <Badge variant="primary">
                  <Zap className="h-3 w-3" />
                  Sub-second Retrieval
                </Badge>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Supporting Source Passages
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
                  title: "Workspace Isolation Standard",
                  section_number: "2.1",
                  section_title: "Multi-Tenant Data Boundaries",
                  score: 0.872,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* CORE CAPABILITIES */}
      <section className="mx-auto max-w-6xl px-6 py-16 border-t border-border-subtle">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Enterprise-Grade Capabilities
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-foreground">
            Designed for High-Stakes Knowledge Work
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every layer of the platform is engineered to preserve document
            context, maximize retrieval precision, and eliminate unverified AI
            hallucinations.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Card className="transition-all hover:border-primary/30">
            <CardHeader>
              <Layers className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Context-Preserving Document Parsing</CardTitle>
              <CardDescription>
                Hierarchical section & parent-child structure
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Automatically detects document headings and numbered clauses.
              Matches fine-grained passages for pinpoint search accuracy while
              supplying full surrounding sections to the AI for complete context.
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/30">
            <CardHeader>
              <Sparkles className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Hybrid Semantic + Keyword Search</CardTitle>
              <CardDescription>
                Dual-engine retrieval with Reciprocal Rank Fusion
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Combines deep conceptual understanding with exact terminology,
              clause numbers, and acronyms—ensuring critical policy or contract
              details are never missed.
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/30">
            <CardHeader>
              <ShieldCheck className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Automated Grounding Verification</CardTitle>
              <CardDescription>
                Strict citation validation & abstention policy
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Verifies that every generated statement is supported by retrieved
              source sections. When your knowledge base lacks sufficient proof,
              the assistant transparently abstains instead of guessing.
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/30">
            <CardHeader>
              <FileSearch className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Neural Relevance Reranking</CardTitle>
              <CardDescription>
                Cross-encoder precision filtering
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Evaluates candidate passages against your exact question to
              surface the highest-signal sections and eliminate redundant
              clauses before synthesis begins.
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/30">
            <CardHeader>
              <Lock className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Multi-Tenant Role-Based Security</CardTitle>
              <CardDescription>
                Granular Admin, Editor, and Viewer governance
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Isolates every workspace across storage, metadata, and vector
              indexes. Role-based permissions govern who can query, upload,
              re-index, or administer team access.
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/30">
            <CardHeader>
              <Zap className="h-6 w-6 text-primary mb-1" />
              <CardTitle>Asynchronous Processing & Caching</CardTitle>
              <CardDescription>
                Instant uploads & intelligent response acceleration
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              Large documents up to 50 MB process seamlessly in the background
              with live status tracking, while intelligent caching delivers
              instant responses for recurring team queries.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="mx-auto max-w-6xl px-6 py-16 border-t border-border-subtle"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Workflow Architecture
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-foreground">
          From Raw Documents to Verified Answers
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Badge variant="primary" className="w-fit">
                Stage 1 · Intelligent Document Ingestion
              </Badge>
              <CardTitle className="mt-2">
                Upload, Structure & Index in Background
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">1. Secure Upload:</strong>{" "}
                Upload PDF, Word, PowerPoint, Markdown, HTML, or plain-text
                documents up to 50 MB with department and tag classifications.
              </p>
              <p>
                <strong className="text-foreground">
                  2. Structural Parsing:
                </strong>{" "}
                Background workers extract clean text, preserve section
                hierarchies, and build linked parent-child context windows.
              </p>
              <p>
                <strong className="text-foreground">3. Hybrid Indexing:</strong>{" "}
                Passages are indexed with both neural semantic embeddings and
                keyword signatures, becoming immediately available for search.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Badge variant="primary" className="w-fit">
                Stage 2 · Grounded Real-Time Synthesis
              </Badge>
              <CardTitle className="mt-2">
                Retrieve, Rerank & Stream with Citations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">
                  1. Scoped Hybrid Search:
                </strong>{" "}
                Your question searches only your workspace’s active documents,
                optionally narrowed by custom tags or selected files.
              </p>
              <p>
                <strong className="text-foreground">
                  2. Reranking & Context Assembly:
                </strong>{" "}
                Top candidate passages are reranked for relevance and expanded
                into complete, deduplicated document sections.
              </p>
              <p>
                <strong className="text-foreground">
                  3. Verified Streaming:
                </strong>{" "}
                Supporting citations arrive first, followed by a live-streamed
                response and an automated grounding confidence score.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECURITY & FAQ */}
      <section className="mx-auto max-w-6xl px-6 py-16 border-t border-border-subtle">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Security & Governance
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-foreground">
              Defense-in-Depth Workspace Isolation
            </h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Every organization workspace operates inside a strict security
              boundary. Access tokens are verified against live membership
              records on every request, ensuring users can only view, search, or
              download documents belonging to their authorized workspace.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="font-semibold text-sm text-foreground">
                Which document formats are supported?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                You can upload PDF, Microsoft Word (.docx), PowerPoint (.pptx),
                HTML, Markdown (.md), and plain text (.txt) files up to 50 MB
                per document.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="font-semibold text-sm text-foreground">
                How does the platform prevent AI hallucinations?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                The assistant is restricted to answering solely from retrieved
                workspace sections, attaches inline section citations to every
                claim, and runs an automated post-generation grounding check.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface py-8 px-6">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground">
              Veritas AI · Enterprise Knowledge Intelligence Platform
            </span>
          </div>
          <span>
            End-to-End Encrypted Sessions · Strict Multi-Tenant Isolation
          </span>
        </div>
      </footer>
    </div>
  );
}
