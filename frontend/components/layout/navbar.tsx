"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  Command,
  LogOut,
  Moon,
  PanelLeft,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { use_auth } from "@/lib/auth";
import { get_health_liveness, get_health_readiness } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ROUTE_LABELS: Record<string, string> = {
  chat: "AI Assistant",
  documents: "Knowledge Base",
  admin: "Administration",
  tenants: "Workspaces & Team",
  login: "Sign In",
};

export function Navbar({
  onToggleSidebar,
  onOpenCommandPalette,
  onToggleTheme,
}: {
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onToggleTheme: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isAuthenticated, signOut } = use_auth();
  const [healthStatus, setHealthStatus] = useState<
    "ready" | "degraded" | "checking"
  >("checking");

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const [live, ready] = await Promise.all([
          get_health_liveness(),
          get_health_readiness(),
        ]);
        if (!active) return;
        if (live.status === "ok" && ready.status === "ready") {
          setHealthStatus("ready");
        } else {
          setHealthStatus("degraded");
        }
      } catch {
        if (active) setHealthStatus("degraded");
      }
    };

    checkHealth();
    const timer = window.setInterval(checkHealth, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const isAuthPage = pathname === "/login" || pathname === "/signup";

  const breadcrumbs = React.useMemo(() => {
    // Unauthenticated pages or auth pages (login, signup) should not display duplicate brand crumbs
    if (!isAuthenticated || isAuthPage) {
      return [];
    }

    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return [{ label: "Workspace", href: "/" }];
    }

    // Direct mapping for admin pages to eliminate non-existent intermediate "Administration" crumb
    if (pathname.startsWith("/admin/super")) {
      return [
        { label: "Workspace", href: "/" },
        { label: "Platform Console", href: "/admin/super" },
      ];
    }
    if (pathname.startsWith("/admin/tenants")) {
      return [
        { label: "Workspace", href: "/" },
        { label: "Workspace Admin", href: "/admin/tenants" },
      ];
    }

    // Filter out intermediate "admin" segment which has no UI page
    const filteredSegments = segments.filter((s) => s.toLowerCase() !== "admin");

    return [
      { label: "Workspace", href: "/" },
      ...filteredSegments.map((segment, index) => {
        const href = "/" + segments.slice(0, index + 1).join("/");
        const mapped = ROUTE_LABELS[segment.toLowerCase()];
        const formatted = mapped
          ? mapped
          : segment.length > 20
          ? "Document Details"
          : segment.charAt(0).toUpperCase() + segment.slice(1);
        return { label: formatted, href };
      }),
    ];
  }, [pathname, isAuthenticated]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/85 px-4 sm:px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {isAuthenticated && !isAuthPage ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            aria-label="Toggle navigation sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-2 mr-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="font-display text-sm font-semibold text-foreground">
              Veritas AI
            </span>
          </Link>
        )}

        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs"
        >
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.href}>
              {idx > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
              <Link
                href={crumb.href}
                className={
                  idx === breadcrumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {crumb.label}
              </Link>
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="hidden sm:inline-flex items-center gap-2.5 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Command className="h-3.5 w-3.5" />
          <span>Quick Search</span>
          <kbd className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl+K
          </kbd>
        </button>

        <div
          className="hidden md:flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px]"
          title="Platform Service Status"
        >
          <span
            className={
              healthStatus === "ready"
                ? "h-2 w-2 rounded-full bg-success"
                : healthStatus === "checking"
                ? "h-2 w-2 rounded-full bg-warning animate-pulse"
                : "h-2 w-2 rounded-full bg-danger"
            }
          />
          <span className="font-medium text-muted-foreground">
            {healthStatus === "ready"
              ? "All Systems Operational"
              : healthStatus === "checking"
              ? "Connecting..."
              : "Service Degraded"}
          </span>
        </div>

        {isAuthenticated && !isAuthPage && session && (
          <div className="hidden lg:flex items-center gap-2">
            <Badge variant="primary" className="capitalize text-[11px]">
              <ShieldCheck className="h-3 w-3" />
              {session.role}
            </Badge>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          aria-label="Toggle color theme"
        >
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </button>

        {isAuthenticated && !isAuthPage ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        ) : (
          <Link href="/login">
            <Button variant="primary" size="sm">
              Sign In
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
