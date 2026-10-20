// Exact TypeScript mirrors of backend Pydantic schemas and SSE payloads in:
// - backend/app/schemas/chat.py:7-30
// - backend/app/services/chat_service.py:82-192

export const CHAT_QUERY_MIN_LENGTH = 1;
export const CHAT_QUERY_MAX_LENGTH = 4000;

// Mirrors ChatRequest (backend/app/schemas/chat.py:7-10)
export interface ChatRequest {
  query: string; // min_length=1, max_length=4000
  tags?: string[] | null;
  doc_ids?: string[] | null;
}

// Mirrors CitationPayload (backend/app/schemas/chat.py:13-22)
export interface CitationPayload {
  doc_id: string;
  title: string;
  section_number: string;
  section_title?: string | null;
  score?: number | null;
}

export type Citation = CitationPayload;

// Mirrors token SSE event payload (backend/app/services/chat_service.py:98,147,151)
export interface TokenEventPayload {
  text: string;
}

// Mirrors DoneEventPayload (backend/app/schemas/chat.py:25-30)
export interface DoneEventPayload {
  request_id: string;
  grounded: boolean;
  confidence?: number | null;
  cache_hit?: boolean;
}

export type ChatEvent =
  | { event: "citation"; data: CitationPayload }
  | { event: "token"; data: TokenEventPayload }
  | { event: "done"; data: DoneEventPayload };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  tagsFilter?: string[];
  docIdsFilter?: string[];
  citations?: CitationPayload[];
  doneMeta?: DoneEventPayload;
  isStreaming?: boolean;
  isAborted?: boolean;
  error?: string;
}
