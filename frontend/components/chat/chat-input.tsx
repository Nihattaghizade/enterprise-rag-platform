"use client";

import React, { useState } from "react";
import { Filter, Send, Square, Tag, X } from "lucide-react";
import {
  CHAT_QUERY_MAX_LENGTH,
  CHAT_QUERY_MIN_LENGTH,
} from "@/types/chat";
import type { DocumentResponse } from "@/types/document";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChatInput({
  availableDocuments,
  isStreaming,
  onSubmitQuery,
  onStopStreaming,
}: {
  availableDocuments: DocumentResponse[];
  isStreaming: boolean;
  onSubmitQuery: (payload: {
    query: string;
    tags: string[];
    doc_ids: string[];
  }) => void;
  onStopStreaming: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const readyDocs = availableDocuments.filter((d) => d.status === "ready");

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (!selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  };

  const toggleDocId = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();

    if (trimmed.length < CHAT_QUERY_MIN_LENGTH) {
      setValidationError("Query must contain at least 1 character.");
      return;
    }
    if (trimmed.length > CHAT_QUERY_MAX_LENGTH) {
      setValidationError(
        `Query exceeds maximum length of ${CHAT_QUERY_MAX_LENGTH} characters.`
      );
      return;
    }

    setValidationError(null);
    onSubmitQuery({
      query: trimmed,
      tags: selectedTags,
      doc_ids: selectedDocIds,
    });
    setQuery("");
  };

  return (
    <div className="border-t border-border bg-surface p-4">
      <form onSubmit={handleFormSubmit} className="mx-auto max-w-4xl space-y-3">
        {showFilters && (
          <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <span>Filter by Tags (`ChatRequest.tags`):</span>
              </div>
              <div className="flex flex-1 items-center gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Type a tag and press Enter..."
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddTag}
                >
                  Add Tag
                </Button>
              </div>
            </div>

            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedTags.map((tag) => (
                  <Badge key={tag} variant="primary">
                    #{tag}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTags((prev) =>
                          prev.filter((item) => item !== tag)
                        )
                      }
                      className="ml-1 hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Scope to Ready Documents (`ChatRequest.doc_ids`):
              </p>
              {readyDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No documents with status `ready` found in this workspace.
                </p>
              ) : (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {readyDocs.map((doc) => {
                    const active = selectedDocIds.includes(doc.id);
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => toggleDocId(doc.id)}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary-muted text-primary font-medium"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {doc.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {validationError && (
          <p className="text-xs text-danger">{validationError}</p>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
              showFilters ||
              selectedTags.length > 0 ||
              selectedDocIds.length > 0
                ? "border-primary/40 bg-primary-muted text-primary"
                : "border-border bg-surface-elevated text-muted-foreground hover:text-foreground"
            }`}
            title="Toggle optional tags and doc_ids filters"
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Filters</span>
            {(selectedTags.length > 0 || selectedDocIds.length > 0) && (
              <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] text-primary-foreground">
                {selectedTags.length + selectedDocIds.length}
              </span>
            )}
          </button>

          <div className="relative flex-1">
            <textarea
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!isStreaming) {
                    handleFormSubmit(e);
                  }
                }
              }}
              placeholder="Ask a question grounded in your workspace's ready documents... (Enter to send, Shift+Enter for newline)"
              className="w-full resize-none rounded-md border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <span className="absolute bottom-2 right-3 font-mono text-[10px] text-muted-foreground">
              {query.length}/{CHAT_QUERY_MAX_LENGTH}
            </span>
          </div>

          {isStreaming ? (
            <Button
              type="button"
              variant="danger"
              onClick={onStopStreaming}
              title="Abort active SSE stream"
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              disabled={query.trim().length === 0}
            >
              <Send className="h-4 w-4" />
              Ask
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
