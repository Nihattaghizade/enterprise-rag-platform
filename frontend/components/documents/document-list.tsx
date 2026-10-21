"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { delete_document, reindex_document } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { ApiRequestError } from "@/types/api";
import type { DocumentResponse } from "@/types/document";
import { DocumentStatus } from "@/components/documents/document-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type SortKey = "created_at" | "title" | "status" | "version" | "char_count";

export function DocumentList({
  documents,
  canManage,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
}: {
  documents: DocumentResponse[];
  canManage: boolean;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onRefresh: () => void;
}) {
  const { pushToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = documents.filter((doc) => {
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.file_name.toLowerCase().includes(q) ||
        (doc.department ?? "").toLowerCase().includes(q) ||
        (doc.doc_type ?? "").toLowerCase().includes(q) ||
        doc.tags.some((t) => t.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "created_at") {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortKey === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortKey === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sortKey === "version") {
        cmp = a.version - b.version;
      } else if (sortKey === "char_count") {
        cmp = (a.char_count ?? 0) - (b.char_count ?? 0);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [documents, searchQuery, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSorted.map((d) => d.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSingleReindex = async (doc: DocumentResponse) => {
    setBusyAction(`reindex-${doc.id}`);
    try {
      await reindex_document(doc.id);
      pushToast({
        tone: "success",
        title: "Re-indexing Started",
        description: `"${doc.title}" has been queued for background re-indexing.`,
      });
      onRefresh();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: "Unable to Re-index Document",
          description: error.message,
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSingleDelete = async (doc: DocumentResponse) => {
    setBusyAction(`delete-${doc.id}`);
    try {
      await delete_document(doc.id);
      pushToast({
        tone: "success",
        title: "Document Removed",
        description: `"${doc.title}" has been removed from your workspace knowledge base.`,
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
      onRefresh();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: "Unable to Remove Document",
          description: error.message,
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleBulkReindex = async () => {
    if (selectedIds.size === 0) return;
    setBusyAction("bulk-reindex");
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => reindex_document(id)));
      pushToast({
        tone: "success",
        title: `Re-indexing ${ids.length} Documents`,
        description:
          "All selected documents have been queued for background processing.",
      });
      setSelectedIds(new Set());
      onRefresh();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: "Bulk Re-index Error",
          description: error.message,
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBusyAction("bulk-delete");
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => delete_document(id)));
      pushToast({
        tone: "success",
        title: `Removed ${ids.length} Documents`,
        description:
          "All selected documents have been removed from your workspace.",
      });
      setSelectedIds(new Set());
      onRefresh();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: "Bulk Delete Error",
          description: error.message,
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2.5">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, filename, tag, or department..."
              className="pl-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            aria-label="Filter documents by status"
            className="h-10 rounded-lg border border-border bg-surface-elevated px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">All Statuses</option>
            <option value="ready">Ready</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {canManage && selectedIds.size > 0 && (
            <>
              <Button
                variant="secondary"
                size="sm"
                isLoading={busyAction === "bulk-reindex"}
                onClick={handleBulkReindex}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-index ({selectedIds.size})
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={busyAction === "bulk-delete"}
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove ({selectedIds.size})
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 font-display text-base font-semibold text-foreground">
            No Matching Documents Found
          </h3>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Upload a PDF, Word, PowerPoint, Markdown, HTML, or text document
            above to add it to your workspace knowledge base.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto rounded-xl border border-border bg-surface shadow-panel">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted border-b border-border">
              <tr className="text-xs font-medium text-muted-foreground">
                {canManage && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        filteredAndSorted.length > 0 &&
                        selectedIds.size === filteredAndSorted.length
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all documents"
                      className="rounded border-border"
                    />
                  </th>
                )}
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("title")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Document
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("status")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Status
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3">Classification & Tags</th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("version")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Version & Size
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("created_at")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Added
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredAndSorted.map((doc) => (
                <tr
                  key={doc.id}
                  className="transition-colors hover:bg-surface-muted/40"
                >
                  {canManage && (
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleSelectOne(doc.id)}
                        aria-label={`Select ${doc.title}`}
                        className="rounded border-border"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="font-medium text-foreground hover:text-primary flex items-center gap-1.5 transition-colors"
                    >
                      <span>{doc.title}</span>
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {doc.file_name}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <DocumentStatus
                      documentId={doc.id}
                      initialStatus={doc.status}
                      autoPoll={doc.status === "processing"}
                      onStatusResolved={() => onRefresh()}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {doc.doc_type && (
                        <Badge variant="outline">{doc.doc_type}</Badge>
                      )}
                      {doc.department && (
                        <Badge variant="default">{doc.department}</Badge>
                      )}
                      {doc.tags.map((tag) => (
                        <Badge key={tag} variant="primary">
                          #{tag}
                        </Badge>
                      ))}
                      {!doc.doc_type &&
                        !doc.department &&
                        doc.tags.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">
                      v{doc.version}
                    </div>
                    <div className="text-[11px]">
                      {doc.page_count !== null
                        ? `${doc.page_count} ${
                            doc.page_count === 1 ? "page" : "pages"
                          }`
                        : "—"}{" "}
                      ·{" "}
                      {doc.char_count !== null
                        ? `${formatNumber(doc.char_count)} chars`
                        : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {formatDateTime(doc.created_at)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Link href={`/documents/${doc.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                      {canManage && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            isLoading={busyAction === `reindex-${doc.id}`}
                            onClick={() => handleSingleReindex(doc)}
                            title="Re-index document"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            isLoading={busyAction === `delete-${doc.id}`}
                            onClick={() => handleSingleDelete(doc)}
                            className="text-danger hover:text-danger"
                            title="Remove document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
