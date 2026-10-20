"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Filter, Send, Square, Tag, X } from "lucide-react";
import { getTrialStatus } from "@/lib/api";
import { use_auth } from "@/lib/auth";
import type { TrialStatusResponse } from "@/types/api";
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
  const { session } = use_auth();
  const [trialStatus, setTrialStatus] = useState<TrialStatusResponse | null>(null);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchTrial = useCallback(async () => {
    if (session?.tenant_id) {
      try {
        const res = await getTrialStatus(session.tenant_id);
        setTrialStatus(res);
      } catch {
        // ignore
      }
    }
  }, [session?.tenant_id]);

  useEffect(() => {
    fetchTrial();
  }, [fetchTrial]);

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
      setValidationError("Please enter a question.");
      return;
    }
    if (trimmed.length > CHAT_QUERY_MAX_LENGTH) {
      setValidationError(
        `Question exceeds the maximum length of ${CHAT_QUERY_MAX_LENGTH} characters.`
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
          <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4 space-y-3.5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground min-w-[140px]">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <span>Filter by Tags</span>
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
                  placeholder="Add a tag filter (e.g. security, compliance) and press Enter..."
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddTag}
                >
                  Add
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

            <div className="space-y-1.5 pt-1 border-t border-border-subtle">
              <p className="text-xs font-medium text-foreground">
                Limit Search to Specific Documents
              </p>
              {readyDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No indexed documents available yet in this workspace.
                </p>
              ) : (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pt-1">
                  {readyDocs.map((doc) => {
                    const active = selectedDocIds.includes(doc.id);
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => toggleDocId(doc.id)}
                        className={`rounded-lg border px-2.5 py-1 text-xs transition-all ${
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

        {trialStatus?.is_trial && (
          <div className="flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-950/20 px-3.5 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Trial AI Inquiry Limit:</span>
              <span className="font-mono text-sky-400 font-medium">
                {trialStatus.questions_asked} / {trialStatus.max_questions} questions used
              </span>
            </div>
            <div className="w-28 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  trialStatus.questions_asked >= trialStatus.max_questions
                    ? "bg-amber-500"
                    : "bg-sky-500"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (trialStatus.questions_asked / trialStatus.max_questions) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {validationError && (
          <p className="text-xs text-danger">{validationError}</p>
        )}

        <div className="flex items-end gap-2.5">
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
              showFilters ||
              selectedTags.length > 0 ||
              selectedDocIds.length > 0
                ? "border-primary/40 bg-primary-muted text-primary"
                : "border-border bg-surface-elevated text-muted-foreground hover:text-foreground"
            }`}
            title="Filter by tags or specific documents"
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Scope</span>
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
              disabled={
                trialStatus?.is_trial
                  ? trialStatus.questions_asked >= trialStatus.max_questions
                  : false
              }
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!isStreaming) {
                    handleFormSubmit(e);
                  }
                }
              }}
              placeholder={
                trialStatus?.is_trial &&
                trialStatus.questions_asked >= trialStatus.max_questions
                  ? "Trial inquiry limit reached (10/10 questions). Contact your administrator to upgrade."
                  : "Ask a question across your workspace documents... (Press Enter to send)"
              }
              className="w-full resize-none rounded-xl border border-border bg-surface-elevated px-4 py-2.5 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
            <span className="absolute bottom-2.5 right-3 font-mono text-[10px] text-muted-foreground/70">
              {query.length}/{CHAT_QUERY_MAX_LENGTH}
            </span>
          </div>

          {isStreaming ? (
            <Button
              type="button"
              variant="danger"
              onClick={onStopStreaming}
              title="Stop generating response"
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              disabled={
                query.trim().length === 0 ||
                (trialStatus?.is_trial
                  ? trialStatus.questions_asked >= trialStatus.max_questions
                  : false)
              }
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
