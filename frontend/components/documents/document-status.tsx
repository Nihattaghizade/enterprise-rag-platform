"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Loader2,
  Trash2,
} from "lucide-react";
import { get_document_status } from "@/lib/api";
import type {
  DocumentStatusResponse,
  DocumentStatusType,
} from "@/types/document";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

const statusConfig: Record<
  DocumentStatusType,
  {
    label: string;
    variant: BadgeVariant;
    icon: React.ReactNode;
  }
> = {
  processing: {
    label: "Processing",
    variant: "warning",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  ready: {
    label: "Ready",
    variant: "success",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    variant: "danger",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  deprecated: {
    label: "Deprecated",
    variant: "outline",
    icon: <Archive className="h-3 w-3" />,
  },
  deleted: {
    label: "Deleted",
    variant: "danger",
    icon: <Trash2 className="h-3 w-3" />,
  },
};

export function DocumentStatus({
  documentId,
  initialStatus,
  autoPoll = false,
  onStatusResolved,
}: {
  documentId?: string;
  initialStatus: DocumentStatusType;
  autoPoll?: boolean;
  onStatusResolved?: (statusPayload: DocumentStatusResponse) => void;
}) {
  const [status, setStatus] = useState<DocumentStatusType>(initialStatus);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (!autoPoll || !documentId || status !== "processing") {
      return;
    }

    let active = true;
    const interval = window.setInterval(async () => {
      try {
        const res = await get_document_status(documentId);
        if (!active) return;
        setStatus(res.status);
        if (res.status !== "processing") {
          onStatusResolved?.(res);
          window.clearInterval(interval);
        }
      } catch {
        // Ignore transient network errors while polling status
      }
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [autoPoll, documentId, status, onStatusResolved]);

  const cfg = statusConfig[status] ?? {
    label: status,
    variant: "default" as BadgeVariant,
    icon: null,
  };

  return (
    <Badge variant={cfg.variant} className="uppercase font-mono text-[10px]">
      {cfg.icon}
      <span>{cfg.label}</span>
    </Badge>
  );
}
