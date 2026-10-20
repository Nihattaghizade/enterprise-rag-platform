"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { use_auth } from "@/lib/auth";
import { list_documents, stream_chat_query } from "@/lib/api";
import { ApiRequestError } from "@/types/api";
import type { ChatMessage, CitationPayload } from "@/types/chat";
import type { DocumentResponse } from "@/types/document";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

const CHAT_HISTORY_KEY_PREFIX = "rag_platform_chat_history_";

export default function ChatPage() {
  const router = useRouter();
  const { session, isAuthenticated, isLoading: authLoading } = use_auth();
  const { pushToast } = useToast();

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!session?.tenant_id) return;
    try {
      const saved = window.localStorage.getItem(
        `${CHAT_HISTORY_KEY_PREFIX}${session.tenant_id}`
      );
      if (saved) {
        setMessages(JSON.parse(saved) as ChatMessage[]);
      }
    } catch {
      // Ignore corrupt local history
    }
  }, [session?.tenant_id]);

  useEffect(() => {
    if (!session?.tenant_id) return;
    try {
      window.localStorage.setItem(
        `${CHAT_HISTORY_KEY_PREFIX}${session.tenant_id}`,
        JSON.stringify(messages)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [messages, session?.tenant_id]);

  const loadCorpusDocuments = useCallback(async () => {
    if (!isAuthenticated) return;
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await list_documents();
      setDocuments(res.items);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setDocsError(`${err.message} (${err.code})`);
      } else {
        setDocsError("Could not load tenant document filters.");
      }
    } finally {
      setDocsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadCorpusDocuments();
    }
  }, [isAuthenticated, loadCorpusDocuments]);

  const handleStopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleSubmitQuery = useCallback(
    async ({
      query,
      tags,
      doc_ids,
    }: {
      query: string;
      tags: string[];
      doc_ids: string[];
    }) => {
      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now() + 1}`;

      const userMessage: ChatMessage = {
        id: userMsgId,
        role: "user",
        content: query,
        createdAt: new Date().toISOString(),
        tagsFilter: tags.length > 0 ? tags : undefined,
        docIdsFilter: doc_ids.length > 0 ? doc_ids : undefined,
      };

      const assistantPlaceholder: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        citations: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const collectedCitations: CitationPayload[] = [];

      try {
        await stream_chat_query(
          {
            query,
            tags: tags.length > 0 ? tags : null,
            doc_ids: doc_ids.length > 0 ? doc_ids : null,
          },
          {
            onCitation: (citation) => {
              collectedCitations.push(citation);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, citations: [...collectedCitations] }
                    : m
                )
              );
            },
            onToken: (tokenPayload) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + tokenPayload.text }
                    : m
                )
              );
            },
            onDone: (donePayload) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        doneMeta: donePayload,
                        isStreaming: false,
                      }
                    : m
                )
              );
            },
          },
          controller.signal
        );
      } catch (err) {
        if (controller.signal.aborted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, isStreaming: false, isAborted: true }
                : m
            )
          );
        } else if (err instanceof ApiRequestError) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    error: `${err.message} (${err.code})`,
                  }
                : m
            )
          );
          pushToast({
            tone: "error",
            title: `Chat Stream Error (${err.code})`,
            description: err.message,
            requestId: err.request_id,
          });
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    error: "Connection interrupted while streaming response.",
                  }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [pushToast]
  );

  if (authLoading || !isAuthenticated) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-2.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground">
            Grounded Retrieval Stream (`POST /api/v1/chat/stream`)
          </span>
          <span className="hidden sm:inline font-mono text-muted-foreground">
            {docsLoading
              ? "Loading tenant corpus..."
              : `${
                  documents.filter((d) => d.status === "ready").length
                } ready documents available`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {docsError && (
            <Button variant="outline" size="sm" onClick={loadCorpusDocuments}>
              <RefreshCw className="h-3 w-3" />
              Retry Corpus Load
            </Button>
          )}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              disabled={isStreaming}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Thread
            </Button>
          )}
        </div>
      </div>

      <ChatMessages messages={messages} />

      <ChatInput
        availableDocuments={documents}
        isStreaming={isStreaming}
        onSubmitQuery={handleSubmitQuery}
        onStopStreaming={handleStopStreaming}
      />
    </div>
  );
}
