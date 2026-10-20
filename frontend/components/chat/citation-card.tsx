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
  const relevancePct = hasScore
    ? `${Math.min(99, Math.max(1, Math.round(citation.score! * 100)))}% match`
    : `Section ${citation.section_number || "1"}`;

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-border bg-surface-elevated p-3.5 transition-all hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary-muted font-mono text-[10px] font-bold text-primary">
            {index + 1}
          </span>
          <Link
            href={`/documents/${citation.doc_id}`}
            className="truncate text-xs font-semibold text-foreground hover:text-primary flex items-center gap-1.5 transition-colors"
            title={citation.title}
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">
              {citation.title || "Untitled Document"}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>

        <Badge variant="outline" className="text-[10px] shrink-0">
          {relevancePct}
        </Badge>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border-subtle pt-2 text-[11px] text-muted-foreground">
        <span className="truncate font-medium">
          Section {citation.section_number || "1"}
          {citation.section_title ? ` — ${citation.section_title}` : ""}
        </span>
      </div>
    </div>
  );
}
