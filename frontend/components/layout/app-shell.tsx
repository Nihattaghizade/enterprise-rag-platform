"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/ui/command-palette";

const THEME_STORAGE_KEY = "rag_platform_theme_v1";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const isDark = saved ? saved === "dark" : prefersDark;
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const nextDark = !root.classList.contains("dark");
    root.classList.toggle("dark", nextDark);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextDark ? "dark" : "light");
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex flex-1">
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex flex-1 flex-col min-w-0">
          <Navbar
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
            onOpenCommandPalette={() => setCommandOpen(true)}
            onToggleTheme={toggleTheme}
          />
          <main className="flex-1">{children}</main>
        </div>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onToggleTheme={toggleTheme}
      />
    </div>
  );
}
