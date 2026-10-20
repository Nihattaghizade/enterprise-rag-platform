"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
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
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] hover:bg-surface-elevated hover:text-foreground transition-colors"
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

    const parts = segment.split(/(\[doc:[^\]]+\])/g);
    return (
      <span key={idx} className="whitespace-pre-wrap leading-relaxed">
        {parts.map((part, partIdx) => {
          if (part.startsWith("[doc:") && part.endsWith("]")) {
            const cleaned = part
              .replace(/^\[doc:\s*/i, "")
              .replace(/\]$/, "")
              .replace(/,\s*section:\s*/i, " · §");
            return (
              <span
                key={partIdx}
                className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-primary-muted px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/25"
                title={part}
              >
                <BookOpenCheck className="h-3 w-3 shrink-0" />
                {cleaned}
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
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-muted text-primary shadow-sm">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-foreground">
          Ask Your Organization’s Knowledge Base
        </h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground leading-relaxed">
          Search across your workspace’s policies, contracts, and documentation.
          Every answer is synthesized directly from verified document sections
          with clickable citations.
        </p>
        <div className="mt-7 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 text-left text-xs">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <BookOpenCheck className="h-4 w-4 text-primary" />
              Section-Level Citations
            </p>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              Every claim links directly to the source document and section
              where the evidence was found.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Verified Grounding Guarantee
            </p>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              If your uploaded documents do not contain the answer, the
              assistant will let you know rather than guessing.
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
            )}

            <div
              className={`max-w-3xl space-y-3 rounded-2xl border p-4 sm:p-5 shadow-panel ${
                isUser
                  ? "border-primary/30 bg-primary-muted/60 text-foreground"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              <div className="flex items-center justify-between gap-4 border-b border-border-subtle pb-2.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {isUser ? "You" : "Veritas AI"}
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
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] hover:bg-surface-muted hover:text-foreground transition-colors"
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
                        #{t}
                      </Badge>
                    ))}
                    {msg.docIdsFilter?.map((id) => (
                      <Badge key={id} variant="outline">
                        Filtered Document
                      </Badge>
                    ))}
                  </div>
                )}

              <div className="text-sm">
                {msg.content ? (
                  renderFormattedText(msg.content)
                ) : msg.isStreaming ? (
                  <span className="inline-flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                    Searching workspace knowledge base and synthesizing answer...
                  </span>
                ) : null}
              </div>

              {msg.error && (
                <div className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{msg.error}</span>
                </div>
              )}

              {!isUser && msg.citations && msg.citations.length > 0 && (
                <div className="space-y-2.5 border-t border-border-subtle pt-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Verified Source Passages ({msg.citations.length})
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {msg.doneMeta.grounded ? (
                      <Badge variant="success">
                        <ShieldCheck className="h-3 w-3" />
                        Verified Grounding (
                        {Math.round((msg.doneMeta.confidence ?? 1) * 100)}%
                        confidence)
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <ShieldAlert className="h-3 w-3" />
                        Insufficient Source Evidence
                      </Badge>
                    )}

                    {msg.doneMeta.cache_hit && (
                      <Badge variant="primary">
                        <Zap className="h-3 w-3" />
                        Instant Cached Answer
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isUser && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
