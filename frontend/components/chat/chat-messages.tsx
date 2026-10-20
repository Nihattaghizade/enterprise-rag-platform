"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import type { ChatMessage } from "@/types/chat";
import { CitationCard } from "@/components/chat/citation-card";
import { Badge } from "@/components/ui/badge";

function CopyCodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-3 overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span>{lang || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] hover:bg-surface-elevated hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-success" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderFormattedText(content: string): React.ReactNode {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return segments.map((segment, idx) => {
    if (segment.startsWith("```") && segment.endsWith("```")) {
      const lines = segment.slice(3, -3).split("\n");
      const firstLine = lines[0]?.trim() ?? "";
      const code = lines.slice(1).join("\n");
      return <CopyCodeBlock key={idx} lang={firstLine} code={code} />;
    }

    // Highlight inline citations of the form [doc: <title>, section: <section_number>]
    const parts = segment.split(/(\[doc:[^\]]+\])/g);
    return (
      <span key={idx} className="whitespace-pre-wrap leading-relaxed">
        {parts.map((part, partIdx) => {
          if (part.startsWith("[doc:") && part.endsWith("]")) {
            return (
              <span
                key={partIdx}
                className="mx-0.5 inline-flex items-center rounded bg-primary-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary border border-primary/25"
              >
                {part}
              </span>
            );
          }
          return <React.Fragment key={partIdx}>{part}</React.Fragment>;
        })}
      </span>
    );
  });
}

export function ChatMessages({ messages }: { messages: ChatMessage[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-muted text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold">
          Evidence-Only Multi-Tenant RAG Assistant
        </h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground leading-relaxed">
          Every question runs hybrid dense (`BAAI/bge-m3` 1024-d) + sparse
          retrieval in Qdrant (top 60), cross-encoder reranking (top 8), parent
          context deduplication (up to 3), and citation grounding verification.
        </p>
        <div className="mt-6 grid max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 text-left text-xs">
          <div className="rounded-lg border border-border bg-surface p-3.5">
            <p className="font-mono font-semibold text-primary">
              [doc: Title, section: X.Y]
            </p>
            <p className="mt-1 text-muted-foreground">
              Every factual statement is required to cite its exact parent
              document title and section number.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3.5">
            <p className="font-mono font-semibold text-primary">
              Strict Abstention Policy
            </p>
            <p className="mt-1 text-muted-foreground">
              If retrieved tenant documents lack sufficient evidence, the
              verifier abstains rather than hallucinating.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
      {messages.map((msg) => {
        const isUser = msg.role === "user";

        return (
          <div
            key={msg.id}
            className={`flex gap-3.5 ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            {!isUser && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={`max-w-3xl space-y-3 rounded-xl border p-4 shadow-panel ${
                isUser
                  ? "border-primary/30 bg-primary-muted/60 text-foreground"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              <div className="flex items-center justify-between gap-4 border-b border-border-subtle pb-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {isUser ? "You" : "Veritas Grounded Assistant"}
                </span>
                <div className="flex items-center gap-2">
                  {!isUser && msg.content && (
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(msg.content);
                        setCopiedId(msg.id);
                        window.setTimeout(() => setCopiedId(null), 1500);
                      }}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-surface-muted hover:text-foreground"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="h-3 w-3 text-success" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {isUser &&
                ((msg.tagsFilter && msg.tagsFilter.length > 0) ||
                  (msg.docIdsFilter && msg.docIdsFilter.length > 0)) && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.tagsFilter?.map((t) => (
                      <Badge key={t} variant="primary">
                        tag:{t}
                      </Badge>
                    ))}
                    {msg.docIdsFilter?.map((id) => (
                      <Badge key={id} variant="outline" className="font-mono">
                        doc:{id.slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                )}

              <div className="text-sm">
                {msg.content ? (
                  renderFormattedText(msg.content)
                ) : msg.isStreaming ? (
                  <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                    Retrieving hybrid candidates & streaming tokens...
                  </span>
                ) : null}
              </div>

              {msg.error && (
                <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{msg.error}</span>
                </div>
              )}

              {!isUser && msg.citations && msg.citations.length > 0 && (
                <div className="space-y-2 border-t border-border-subtle pt-3">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Retrieved Parent Context Citations ({msg.citations.length})
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {msg.citations.map((cit, i) => (
                      <CitationCard
                        key={`${cit.doc_id}-${cit.section_number}-${i}`}
                        citation={cit}
                        index={i}
                      />
                    ))}
                  </div>
                </div>
              )}

              {!isUser && msg.doneMeta && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {msg.doneMeta.grounded ? (
                      <Badge variant="success">
                        <ShieldCheck className="h-3 w-3" />
                        Grounded (
                        {Math.round((msg.doneMeta.confidence ?? 1) * 100)}%
                        confidence)
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <ShieldAlert className="h-3 w-3" />
                        Abstained / Ungrounded (
                        {Math.round((msg.doneMeta.confidence ?? 0) * 100)}%)
                      </Badge>
                    )}

                    {msg.doneMeta.cache_hit && (
                      <Badge variant="primary">
                        <Zap className="h-3 w-3" />
                        Redis Query Cache Hit
                      </Badge>
                    )}
                  </div>

                  <span className="font-mono text-[10px] text-muted-foreground">
                    request_id: {msg.doneMeta.request_id}
                  </span>
                </div>
              )}
            </div>

            {isUser && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-elevated text-foreground">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
