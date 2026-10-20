// Exact TypeScript mirrors of backend Pydantic schemas in:
// - backend/app/schemas/documents.py:8-57
// - backend/app/storage/s3_adapter.py:16-24
// - backend/app/ingestion/parser.py:11-18

export type DocumentStatusType =
  | "processing"
  | "ready"
  | "failed"
  | "deprecated"
  | "deleted";

// Exact upload limits & allowed extensions from backend/app/storage/s3_adapter.py:16-24 & parser.py:11-18
export const MAX_UPLOAD_SIZE_BYTES = 52_428_800; // 50 * 1024 * 1024 (50 MB)

export const ALLOWED_EXTENSIONS = [
  ".txt",
  ".md",
  ".html",
  ".htm",
  ".pdf",
  ".docx",
  ".pptx",
] as const;

export const ALLOWED_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/html",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

// Mirrors DocumentResponse (backend/app/schemas/documents.py:8-29)
export interface DocumentResponse {
  id: string;
  tenant_id: string;
  title: string;
  file_name: string;
  mime_type: string;
  storage_key: string;
  status: DocumentStatusType;
  version: number;
  page_count: number | null;
  char_count: number | null;
  doc_type: string | null;
  author: string | null;
  department: string | null;
  tags: string[];
  language: string | null;
  uploader_id: string;
  created_at: string;
  updated_at: string;
  download_url: string | null;
}

// Alias for architectural compatibility
export type Document = DocumentResponse;

// Mirrors DocumentUploadAcceptedResponse (backend/app/schemas/documents.py:32-35)
export interface DocumentUploadAcceptedResponse {
  document: DocumentResponse;
  job_id: string;
  status: string; // "processing"
}

// Mirrors DocumentStatusResponse (backend/app/schemas/documents.py:38-46)
export interface DocumentStatusResponse {
  id: string;
  tenant_id: string;
  status: DocumentStatusType;
  version: number;
  page_count: number | null;
  char_count: number | null;
  updated_at: string;
}

// Mirrors DocumentListResponse (backend/app/schemas/documents.py:49-51)
export interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
}

// Mirrors DocumentReindexResponse (backend/app/schemas/documents.py:54-57)
export interface DocumentReindexResponse {
  document_id: string;
  job_id: string;
  status: string; // "processing"
}

// Multipart upload fields accepted by POST /api/v1/documents (backend/app/api/documents.py:26-32)
export interface DocumentUploadFormPayload {
  file: File;
  title?: string;
  doc_type?: string;
  author?: string;
  department?: string;
  tags?: string; // comma-separated string split on "," by backend/app/api/documents.py:38
  language?: string;
}
