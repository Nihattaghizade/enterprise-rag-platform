"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Crown,
  FileText,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { use_auth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  badge?: string;
}

export function Sidebar({
  collapsed,
}: {
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { session, isAuthenticated, isAdmin, isSuperAdmin, isTrialViewer } =
    use_auth();

  if (!isAuthenticated) {
    return null;
  }

  const navItems: NavItem[] = [
    {
      label: "Platform Console",
      href: "/admin/super",
      icon: <Crown className="h-4 w-4 shrink-0 text-amber-400" />,
      superAdminOnly: true,
      badge: "Root",
    },
    {
      label: "Overview",
      href: "/",
      icon: <LayoutGrid className="h-4 w-4 shrink-0" />,
    },
    {
      label: "AI Assistant",
      href: "/chat",
      icon: <MessageSquare className="h-4 w-4 shrink-0" />,
      badge: "Live",
    },
    {
      label: "Knowledge Base",
      href: "/documents",
      icon: <FileText className="h-4 w-4 shrink-0" />,
    },
    {
      label: "Workspace Admin",
      href: "/admin/tenants",
      icon: <Building2 className="h-4 w-4 shrink-0" />,
      adminOnly: true,
    },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-surface transition-all duration-200 select-none",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="truncate">
              <p className="font-display text-sm font-semibold tracking-tight leading-none text-foreground">
                Veritas AI
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Knowledge Intelligence
              </p>
            </div>
          )}
        </Link>
      </div>

      <div className="flex-1 space-y-1 p-3">
        {!collapsed && (
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Workspace
          </p>
        )}
        {navItems.map((item) => {
          if (item.superAdminOnly && !isSuperAdmin) return null;
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
                "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-primary-muted text-primary shadow-sm border border-primary/20"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-3 truncate">
                {item.icon}
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>
              {!collapsed && item.badge && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {!collapsed && session && (
        <div className="border-t border-border p-3.5 text-xs">
          <div className="rounded-xl border border-border-subtle bg-surface-elevated p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Protected Workspace
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Active
              </span>
            </div>
            <p className="text-xs font-medium text-foreground truncate">
              {session.email || "Signed-in Member"}
            </p>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border-subtle">
              <span className="capitalize">{session.role} Access</span>
              <span className="font-mono text-[10px] opacity-80">
                ID: {session.tenant_id.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
