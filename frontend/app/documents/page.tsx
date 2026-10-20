"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import { use_auth } from "@/lib/auth";
import { list_documents } from "@/lib/api";
import { ApiRequestError } from "@/types/api";
import type { DocumentResponse } from "@/types/document";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentList } from "@/components/documents/document-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading: authLoading,
    canWriteDocuments,
    session,
  } = use_auth();

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const fetchDocuments = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await list_documents(statusFilter || null);
      setDocuments(response.items);
      setTotal(response.total);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`${err.message} (${err.code})`);
      } else {
        setError("Failed to fetch tenant documents from backend.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, statusFilter]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDocuments();
    }
  }, [isAuthenticated, fetchDocuments]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold">
              Tenant Document Corpus
            </h1>
            <Badge variant="primary" className="font-mono">
              total: {total}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Scoped strictly to `tenant_id: {session?.tenant_id}`.{" "}
            {canWriteDocuments
              ? "Your role permits uploading, reindexing, and deleting documents."
              : "Viewer role: read-only access to documents and presigned downloads."}
          </p>
        </div>
      </div>

      {canWriteDocuments && (
        <DocumentUpload
          onUploadAccepted={() => {
            fetchDocuments();
          }}
        />
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDocuments}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <DocumentList
          documents={documents}
          canManage={canWriteDocuments}
          statusFilter={statusFilter}
          onStatusFilterChange={(nextStatus) => setStatusFilter(nextStatus)}
          onRefresh={fetchDocuments}
        />
      )}
    </div>
  );
}
