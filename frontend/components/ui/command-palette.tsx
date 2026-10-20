"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  FileText,
  Home,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { use_auth } from "@/lib/auth";

interface CommandAction {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onToggleTheme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleTheme: () => void;
}) {
  const router = useRouter();
  const { isAuthenticated, isAdmin, signOut } = use_auth();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      } else if (event.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const actions = useMemo<CommandAction[]>(() => {
    const list: CommandAction[] = [
      {
        id: "home",
        label: isAuthenticated
          ? "Go to Workspace Overview"
          : "Go to Platform Home",
        section: "Navigation",
        icon: <Home className="h-4 w-4 text-primary" />,
        onSelect: () => router.push("/"),
      },
    ];

    if (isAuthenticated) {
      list.push(
        {
          id: "chat",
          label: "Open AI Knowledge Assistant",
          section: "Navigation",
          shortcut: "G C",
          icon: <MessageSquare className="h-4 w-4 text-primary" />,
          onSelect: () => router.push("/chat"),
        },
        {
          id: "documents",
          label: "Browse & Upload Knowledge Base Documents",
          section: "Navigation",
          shortcut: "G D",
          icon: <FileText className="h-4 w-4 text-primary" />,
          onSelect: () => router.push("/documents"),
        }
      );

      if (isAdmin) {
        list.push({
          id: "admin-tenants",
          label: "Workspace & Team Administration",
          section: "Administration",
          shortcut: "G A",
          icon: <Building2 className="h-4 w-4 text-primary" />,
          onSelect: () => router.push("/admin/tenants"),
        });
      }

      list.push({
        id: "logout",
        label: "Sign out of workspace",
        section: "Account",
        icon: <LogOut className="h-4 w-4 text-danger" />,
        onSelect: async () => {
          await signOut();
          router.push("/login");
        },
      });
    } else {
      list.push({
        id: "login",
        label: "Sign in to Workspace",
        section: "Account",
        icon: <LogIn className="h-4 w-4 text-primary" />,
        onSelect: () => router.push("/login"),
      });
    }

    list.push({
      id: "theme",
      label: "Switch Light / Dark Appearance",
      section: "Preferences",
      shortcut: "T",
      icon: (
        <span className="inline-flex">
          <Sun className="h-4 w-4 dark:hidden text-warning" />
          <Moon className="hidden h-4 w-4 dark:block text-primary" />
        </span>
      ),
      onSelect: () => onToggleTheme(),
    });

    return list;
  }, [isAuthenticated, isAdmin, router, signOut, onToggleTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q)
    );
  }, [actions, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Search"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, actions, or preferences..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No matching commands found.
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.onSelect();
                  onOpenChange(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.section}
                    </p>
                  </div>
                </div>
                {item.shortcut && (
                  <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {item.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
