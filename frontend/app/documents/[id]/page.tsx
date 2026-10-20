"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  FileText,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { use_auth } from "@/lib/auth";
import {
  delete_document,
  get_document,
  get_document_status,
  reindex_document,
} from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { ApiRequestError } from "@/types/api";
import type { DocumentResponse } from "@/types/document";
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
import { useToast } from "@/components/ui/toast";

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params?.id ?? "";
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading: authLoading,
    canWriteDocuments,
  } = use_auth();
  const { pushToast } = useToast();

  const [doc, setDoc] = useState<DocumentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPollingStatus, setIsPollingStatus] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const fetchDocumentDetail = useCallback(async () => {
    if (!documentId || !isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await get_document(documentId, true);
      setDoc(response);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`${err.message} (${err.code})`);
      } else {
        setError("Failed to load document details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [documentId, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && documentId) {
      fetchDocumentDetail();
    }
  }, [isAuthenticated, documentId, fetchDocumentDetail]);

  const handleProbeStatus = async () => {
    if (!documentId) return;
    setIsPollingStatus(true);
    try {
      const statusRes = await get_document_status(documentId);
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              status: statusRes.status,
              version: statusRes.version,
              page_count: statusRes.page_count,
              char_count: statusRes.char_count,
              updated_at: statusRes.updated_at,
            }
          : prev
      );
      pushToast({
        tone: "info",
        title: `Status: ${statusRes.status}`,
        description: `Version v${statusRes.version} · Updated ${formatDateTime(
          statusRes.updated_at
        )}`,
      });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: `Status Probe Error (${err.code})`,
          description: err.message,
          requestId: err.request_id,
        });
      }
    } finally {
      setIsPollingStatus(false);
    }
  };

  const handleReindex = async () => {
    if (!doc) return;
    setIsReindexing(true);
    try {
      const res = await reindex_document(doc.id);
      pushToast({
        tone: "success",
        title: "202 Accepted — Reindex Job Queued",
        description: `Job ${res.job_id} queued on Redis ingestion queue.`,
      });
      await fetchDocumentDetail();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: `Reindex Failed (${err.code})`,
          description: err.message,
          requestId: err.request_id,
        });
      }
    } finally {
      setIsReindexing(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    setIsDeleting(true);
    try {
      await delete_document(doc.id);
      pushToast({
        tone: "success",
        title: "Document Deleted",
        description:
          "Removed from Qdrant chunks, MinIO storage, parent_contexts, and Redis query cache.",
      });
      router.push("/documents");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: `Delete Failed (${err.code})`,
          description: err.message,
          requestId: err.request_id,
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link href="/documents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to Tenant Corpus
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            isLoading={isPollingStatus}
            onClick={handleProbeStatus}
            title="GET /api/v1/documents/{document_id}/status"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Poll `/status`
          </Button>
        </div>
      </div>

      {error || !doc ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-10 w-10 text-danger" />
            <h2 className="mt-3 font-display text-lg font-semibold">
              {error || "Document not found."}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The requested document does not exist, belongs to another tenant,
              or has been deleted (`404 Not Found`).
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={fetchDocumentDetail}
            >
              Retry Request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle className="text-2xl">{doc.title}</CardTitle>
                  <DocumentStatus
                    documentId={doc.id}
                    initialStatus={doc.status}
                    autoPoll={doc.status === "processing"}
                    onStatusResolved={() => fetchDocumentDetail()}
                  />
                </div>
                <CardDescription className="font-mono text-xs">
                  id: {doc.id} · storage_key: {doc.storage_key}
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {doc.download_url && (
                  <a
                    href={doc.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="secondary" size="sm">
                      <Download className="h-3.5 w-3.5" />
                      Presigned MinIO Download
                    </Button>
                  </a>
                )}

                {canWriteDocuments && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={isReindexing}
                      onClick={handleReindex}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reindex (`v{doc.version + 1}`)
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={isDeleting}
                      onClick={handleDelete}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>

            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4 border-t border-border-subtle text-xs">
              <div className="rounded-md border border-border-subtle bg-surface-elevated p-3.5">
                <span className="text-muted-foreground">File Name & MIME</span>
                <p className="mt-1 font-mono font-medium text-foreground">
                  {doc.file_name}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {doc.mime_type}
                </p>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface-elevated p-3.5">
                <span className="text-muted-foreground">
                  Version & Extracted Metrics
                </span>
                <p className="mt-1 font-mono font-medium text-foreground">
                  Version v{doc.version}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  Pages: {doc.page_count ?? "—"} · Chars:{" "}
                  {formatNumber(doc.char_count)}
                </p>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface-elevated p-3.5">
                <span className="text-muted-foreground">
                  Classification Metadata
                </span>
                <p className="mt-1 font-medium text-foreground">
                  Type: {doc.doc_type || "—"} · Dept: {doc.department || "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Author: {doc.author || "—"} · Lang: {doc.language || "—"}
                </p>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface-elevated p-3.5">
                <span className="text-muted-foreground">Tenant & Uploader</span>
                <p className="mt-1 font-mono text-[11px] text-foreground truncate">
                  tenant_id: {doc.tenant_id}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground truncate">
                  uploader_id: {doc.uploader_id}
                </p>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface-elevated p-3.5">
                <span className="text-muted-foreground">Timestamps</span>
                <p className="mt-1 text-foreground">
                  Created: {formatDateTime(doc.created_at)}
                </p>
                <p className="text-muted-foreground">
                  Updated: {formatDateTime(doc.updated_at)}
                </p>
              </div>

              <div className="rounded-md border border-border-subtle bg-surface-elevated p-3.5">
                <span className="text-muted-foreground">Document Tags</span>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {doc.tags.length === 0 ? (
                    <span className="text-muted-foreground">No tags</span>
                  ) : (
                    doc.tags.map((tag) => (
                      <Badge key={tag} variant="primary">
                        #{tag}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
