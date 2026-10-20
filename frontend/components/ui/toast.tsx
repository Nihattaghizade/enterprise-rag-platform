"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  requestId?: string | null;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      window.setTimeout(() => {
        removeToast(id);
      }, 5000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5 pointer-events-none"
      >
        {toasts.map((t) => {
          const tone = t.tone ?? "info";
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-elevated backdrop-blur-md transition-all",
                tone === "success" &&
                  "border-success/40 bg-surface-elevated text-foreground",
                tone === "error" &&
                  "border-danger/40 bg-surface-elevated text-foreground",
                tone === "info" &&
                  "border-border bg-surface-elevated text-foreground"
              )}
            >
              {tone === "success" && (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              )}
              {tone === "error" && (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              )}
              {tone === "info" && (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              )}
              <div className="flex-1 text-xs">
                <p className="font-semibold text-sm">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-muted-foreground leading-relaxed">
                    {t.description}
                  </p>
                )}
                {t.requestId && (
                  <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                    request_id: {t.requestId}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
