"use client";

import React from "react";
import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import type { CitationPayload } from "@/types/chat";
import { Badge } from "@/components/ui/badge";

export function CitationCard({
  citation,
  index,
}: {
  citation: CitationPayload;
  index: number;
}) {
  const hasScore =
    typeof citation.score === "number" && !Number.isNaN(citation.score);

  return (
    <div className="group flex flex-col justify-between rounded-md border border-border bg-surface-elevated p-3 transition-all hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary-muted font-mono text-[10px] font-bold text-primary">
            {index + 1}
          </span>
          <Link
            href={`/documents/${citation.doc_id}`}
            className="truncate text-xs font-semibold text-foreground hover:text-primary flex items-center gap-1"
            title={citation.title}
          >
            <BookOpen className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">{citation.title || "Untitled Document"}</span>
            <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>

        <Badge variant="outline" className="font-mono text-[10px] shrink-0">
          {hasScore ? `score: ${citation.score!.toFixed(3)}` : `§ ${citation.section_number || "1"}`}
        </Badge>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2 text-[11px] text-muted-foreground">
        <span className="font-mono">
          § {citation.section_number || "1"}
          {citation.section_title ? ` — ${citation.section_title}` : ""}
        </span>
        <span className="font-mono text-[10px] opacity-75">
          [doc: {citation.title || citation.doc_id}, section: {citation.section_number || "1"}]
        </span>
      </div>
    </div>
  );
}
