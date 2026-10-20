import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "@/components/layout/app-shell";

const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
});

const sansFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Veritas Enterprise RAG Platform — Multi-Tenant Grounded Intelligence",
  description:
    "Text-only multi-tenant enterprise RAG with MinIO S3 storage, adaptive legal chunking, Qdrant BGE-M3 dense+sparse RRF retrieval, cross-encoder reranking, and verified citations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}
    >
      <body>
        <AuthProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
