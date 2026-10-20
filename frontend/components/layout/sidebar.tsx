"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Database,
  FileText,
  LayoutGrid,
  Lock,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { use_auth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  badge?: string;
}

export function Sidebar({
  collapsed,
}: {
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { session, isAuthenticated, isAdmin } = use_auth();

  if (!isAuthenticated) {
    return null;
  }

  const navItems: NavItem[] = [
    {
      label: "Workspace Bento",
      href: "/",
      icon: <LayoutGrid className="h-4 w-4 shrink-0" />,
    },
    {
      label: "Evidence Chat",
      href: "/chat",
      icon: <MessageSquare className="h-4 w-4 shrink-0" />,
      badge: "SSE",
    },
    {
      label: "Document Corpus",
      href: "/documents",
      icon: <FileText className="h-4 w-4 shrink-0" />,
    },
    {
      label: "Tenants & RBAC",
      href: "/admin/tenants",
      icon: <Building2 className="h-4 w-4 shrink-0" />,
      adminOnly: true,
    },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-surface transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-mono text-xs font-bold">
            V2
          </div>
          {!collapsed && (
            <div className="truncate">
              <p className="font-display text-sm font-semibold leading-none">
                Veritas RAG
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                BGE-M3 · Hybrid RRF
              </p>
            </div>
          )}
        </Link>
      </div>

      <div className="flex-1 space-y-1 p-2.5">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-muted text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-3 truncate">
                {item.icon}
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>
              {!collapsed && item.badge && (
                <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border-subtle">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {!collapsed && session && (
        <div className="border-t border-border p-3.5 text-xs">
          <div className="rounded-md border border-border-subtle bg-surface-elevated p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Lock className="h-3.5 w-3.5 text-primary" />
                Tenant Isolation
              </span>
              <span className="font-mono text-[10px] uppercase text-success">
                Enforced
              </span>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground truncate">
              {session.email || `user:${session.user_id.slice(0, 8)}`}
            </p>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border-subtle">
              <span className="flex items-center gap-1">
                <Database className="h-3 w-3" /> Qdrant + PG
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Sparkles className="h-3 w-3 text-primary" /> Top 60→8→3
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
