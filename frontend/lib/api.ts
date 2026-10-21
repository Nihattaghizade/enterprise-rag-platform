import {
  ApiRequestError,
  type ApiErrorEnvelope,
  type HealthLivenessResponse,
  type HealthReadinessResponse,
  type LoginRequest,
  type LogoutResponse,
  type MemberAddRequest,
  type MemberRoleUpdateRequest,
  type MembershipResponse,
  type PendingApprovalResponse,
  type PlatformUserResponse,
  type RefreshRequest,
  type RoleType,
  type SignUpRequest,
  type SignUpResponse,
  type SuperadminCreateUserRequest,
  type SuperadminOverviewResponse,
  type TenantCreateRequest,
  type TenantResponse,
  type TokenResponse,
  type TrialStatusResponse,
  type WorkspaceOption,
} from "@/types/api";
import type {
  DocumentListResponse,
  DocumentReindexResponse,
  DocumentResponse,
  DocumentStatusResponse,
  DocumentUploadAcceptedResponse,
  DocumentUploadFormPayload,
} from "@/types/document";
import type { ChatRequest } from "@/types/chat";
import { consume_sse_stream, type StreamCallbacks } from "@/lib/sse";

const SESSION_STORAGE_KEY = "rag_platform_auth_session_v1";

export interface StoredAuthSession {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
  tenant_id: string;
  role: RoleType;
  email?: string;
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!envUrl || envUrl.trim().length === 0) {
    return "http://localhost:8000";
  }
  return envUrl.replace(/\/+$/, "");
}

export function loadStoredSession(): StoredAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuthSession;
  } catch {
    return null;
  }
}

export function saveStoredSession(
  tokenResponse: TokenResponse,
  email?: string
): StoredAuthSession {
  const existing = loadStoredSession();
  const session: StoredAuthSession = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    token_type: tokenResponse.token_type,
    user_id: tokenResponse.user_id,
    tenant_id: tokenResponse.tenant_id,
    role: tokenResponse.role,
    email: email ?? existing?.email,
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("rag-auth-updated", { detail: session }));
  }
  return session;
}

export function clearStoredSession(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("rag-auth-updated", { detail: null }));
  }
}

async function parseErrorResponse(response: Response): Promise<ApiRequestError> {
  const requestIdHeader = response.headers.get("X-Request-ID");
  try {
    const body = (await response.json()) as Partial<ApiErrorEnvelope>;
    return new ApiRequestError(response.status, {
      code: body.code || `http_${response.status}`,
      message: body.message || response.statusText || "Request failed.",
      details: (body.details as Record<string, unknown>) || {},
      request_id: body.request_id ?? requestIdHeader ?? null,
    });
  } catch {
    return new ApiRequestError(response.status, {
      code: `http_${response.status}`,
      message: response.statusText || "Network or server error occurred.",
      details: {},
      request_id: requestIdHeader ?? null,
    });
  }
}

let activeRefreshPromise: Promise<TokenResponse | null> | null = null;

async function attemptAutomaticRefresh(): Promise<TokenResponse | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const current = loadStoredSession();
      const refreshed = await refreshToken({
        refresh_token: current?.refresh_token ?? null,
      });
      saveStoredSession(refreshed, current?.email);
      return refreshed;
    } catch {
      clearStoredSession();
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

interface RequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  skipAuthRefresh?: boolean;
}

async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { headers = {}, skipAuthRefresh = false, ...rest } = options;
  const session = loadStoredSession();

  const requestHeaders: Record<string, string> = {
    ...headers,
  };

  if (session?.access_token && !requestHeaders["Authorization"]) {
    requestHeaders["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers: requestHeaders,
    credentials: "include",
  });

  if (response.status === 401 && !skipAuthRefresh) {
    const refreshed = await attemptAutomaticRefresh();
    if (refreshed) {
      const retryHeaders: Record<string, string> = {
        ...headers,
        Authorization: `Bearer ${refreshed.access_token}`,
      };
      const retryResponse = await fetch(`${getApiBaseUrl()}${path}`, {
        ...rest,
        headers: retryHeaders,
        credentials: "include",
      });
      if (!retryResponse.ok) {
        throw await parseErrorResponse(retryResponse);
      }
      return (await retryResponse.json()) as T;
    }
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as T;
}

// ============================================================================
// AUTH ENDPOINTS (backend/app/api/auth.py)
// ============================================================================

// Backend: POST /api/v1/auth/login (backend/app/api/auth.py:45)
export async function login(payload: LoginRequest): Promise<TokenResponse> {
  const body: Record<string, unknown> = {
    email: payload.email.trim(),
    password: payload.password,
  };
  if (payload.tenant_id && payload.tenant_id.trim().length > 0) {
    body.tenant_id = payload.tenant_id.trim();
  }

  const tokenData = await apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    skipAuthRefresh: true,
  });

  saveStoredSession(tokenData, payload.email.trim());
  return tokenData;
}

// Backend: POST /api/v1/auth/refresh (backend/app/api/auth.py:78)
export async function refreshToken(
  payload?: RefreshRequest
): Promise<TokenResponse> {
  const current = loadStoredSession();
  const refreshValue = payload?.refresh_token ?? current?.refresh_token ?? null;

  const tokenData = await apiFetch<TokenResponse>("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshValue }),
    skipAuthRefresh: true,
  });

  saveStoredSession(tokenData, current?.email);
  return tokenData;
}

// Backend: POST /api/v1/auth/logout (backend/app/api/auth.py:119)
export async function logout(): Promise<LogoutResponse> {
  try {
    return await apiFetch<LogoutResponse>("/api/v1/auth/logout", {
      method: "POST",
      skipAuthRefresh: true,
    });
  } finally {
    clearStoredSession();
  }
}

// ============================================================================
// DOCUMENT ENDPOINTS (backend/app/api/documents.py)
// ============================================================================

// Backend: POST /api/v1/documents (backend/app/api/documents.py:21)
export async function upload_document(
  payload: DocumentUploadFormPayload
): Promise<DocumentUploadAcceptedResponse> {
  const formData = new FormData();
  formData.append("file", payload.file);

  if (payload.title && payload.title.trim().length > 0) {
    formData.append("title", payload.title.trim());
  }
  if (payload.doc_type && payload.doc_type.trim().length > 0) {
    formData.append("doc_type", payload.doc_type.trim());
  }
  if (payload.author && payload.author.trim().length > 0) {
    formData.append("author", payload.author.trim());
  }
  if (payload.department && payload.department.trim().length > 0) {
    formData.append("department", payload.department.trim());
  }
  if (payload.tags && payload.tags.trim().length > 0) {
    formData.append("tags", payload.tags.trim());
  }
  if (payload.language && payload.language.trim().length > 0) {
    formData.append("language", payload.language.trim());
  }

  return apiFetch<DocumentUploadAcceptedResponse>("/api/v1/documents", {
    method: "POST",
    body: formData,
  });
}

// Backend: GET /api/v1/documents (backend/app/api/documents.py:62)
export async function list_documents(
  status?: string | null
): Promise<DocumentListResponse> {
  const params = new URLSearchParams();
  if (status && status.trim().length > 0) {
    params.set("status", status.trim());
  }
  const queryString = params.toString();
  const path = queryString
    ? `/api/v1/documents?${queryString}`
    : "/api/v1/documents";
  return apiFetch<DocumentListResponse>(path, { method: "GET" });
}

// Backend: GET /api/v1/documents/{document_id} (backend/app/api/documents.py:78)
export async function get_document(
  documentId: string,
  includeDownloadUrl: boolean = false
): Promise<DocumentResponse> {
  const params = new URLSearchParams();
  if (includeDownloadUrl) {
    params.set("include_download_url", "true");
  }
  const queryString = params.toString();
  const path = queryString
    ? `/api/v1/documents/${encodeURIComponent(documentId)}?${queryString}`
    : `/api/v1/documents/${encodeURIComponent(documentId)}`;
  return apiFetch<DocumentResponse>(path, { method: "GET" });
}

// Backend: GET /api/v1/documents/{document_id}/status (backend/app/api/documents.py:96)
export async function get_document_status(
  documentId: string
): Promise<DocumentStatusResponse> {
  return apiFetch<DocumentStatusResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/status`,
    { method: "GET" }
  );
}

// Backend: POST /api/v1/documents/{document_id}/reindex (backend/app/api/documents.py:118)
export async function reindex_document(
  documentId: string
): Promise<DocumentReindexResponse> {
  return apiFetch<DocumentReindexResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/reindex`,
    { method: "POST" }
  );
}

// Backend: DELETE /api/v1/documents/{document_id} (backend/app/api/documents.py:140)
export async function delete_document(
  documentId: string
): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" }
  );
}

// ============================================================================
// CHAT STREAMING ENDPOINT (backend/app/api/chat.py)
// ============================================================================

// Backend: POST /api/v1/chat/stream (backend/app/api/chat.py:13)
export async function stream_chat_query(
  payload: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const session = loadStoredSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  let response = await fetch(`${getApiBaseUrl()}/api/v1/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: payload.query,
      tags: payload.tags && payload.tags.length > 0 ? payload.tags : null,
      doc_ids:
        payload.doc_ids && payload.doc_ids.length > 0 ? payload.doc_ids : null,
    }),
    credentials: "include",
    signal,
  });

  if (response.status === 401) {
    const refreshed = await attemptAutomaticRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${refreshed.access_token}`;
      response = await fetch(`${getApiBaseUrl()}/api/v1/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: payload.query,
          tags: payload.tags && payload.tags.length > 0 ? payload.tags : null,
          doc_ids:
            payload.doc_ids && payload.doc_ids.length > 0
              ? payload.doc_ids
              : null,
        }),
        credentials: "include",
        signal,
      });
    }
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  await consume_sse_stream(response, callbacks, signal);
}

// ============================================================================
// TENANT & MEMBERSHIP ADMIN ENDPOINTS (backend/app/api/tenants.py)
// ============================================================================

// Backend: GET /api/v1/tenants (backend/app/api/tenants.py:21)
export async function list_tenants(): Promise<TenantResponse[]> {
  return apiFetch<TenantResponse[]>("/api/v1/tenants", { method: "GET" });
}

// Backend: GET /api/v1/tenants/{tenant_id} (backend/app/api/tenants.py)
export async function get_tenant(tenantId: string): Promise<TenantResponse> {
  return apiFetch<TenantResponse>(`/api/v1/tenants/${encodeURIComponent(tenantId)}`, {
    method: "GET",
  });
}

// Backend: POST /api/v1/tenants (backend/app/api/tenants.py:30)
export async function create_tenant(
  payload: TenantCreateRequest
): Promise<TenantResponse> {
  return apiFetch<TenantResponse>("/api/v1/tenants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Backend: GET /api/v1/tenants/{tenant_id}/members (backend/app/api/tenants.py:46)
export async function list_tenant_members(
  tenantId: string
): Promise<MembershipResponse[]> {
  return apiFetch<MembershipResponse[]>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/members`,
    { method: "GET" }
  );
}

// Backend: POST /api/v1/tenants/{tenant_id}/members (backend/app/api/tenants.py:57)
export async function add_tenant_member(
  tenantId: string,
  payload: MemberAddRequest
): Promise<MembershipResponse> {
  const body: Record<string, unknown> = {
    email: payload.email.trim(),
    role: payload.role,
  };
  if (payload.password && payload.password.length > 0) {
    body.password = payload.password;
  }
  return apiFetch<MembershipResponse>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/members`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

// Backend: PATCH /api/v1/tenants/{tenant_id}/members/{user_id} (backend/app/api/tenants.py:79)
export async function update_tenant_member_role(
  tenantId: string,
  userId: string,
  payload: MemberRoleUpdateRequest
): Promise<MembershipResponse> {
  return apiFetch<MembershipResponse>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

// ============================================================================
// HEALTH, READINESS & METRICS ENDPOINTS (backend/app/api/health.py)
// ============================================================================

// Backend: GET /health (backend/app/api/health.py:14)
export async function get_health_liveness(): Promise<HealthLivenessResponse> {
  return apiFetch<HealthLivenessResponse>("/health", {
    method: "GET",
    skipAuthRefresh: true,
  });
}

// Backend: GET /ready (backend/app/api/health.py:20)
export async function get_health_readiness(): Promise<HealthReadinessResponse> {
  return apiFetch<HealthReadinessResponse>("/ready", {
    method: "GET",
    skipAuthRefresh: true,
  });
}

// Backend: GET /metrics (backend/app/api/health.py:42)
export async function get_prometheus_metrics(): Promise<string> {
  const session = loadStoredSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  let response = await fetch(`${getApiBaseUrl()}/metrics`, {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    const refreshed = await attemptAutomaticRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${refreshed.access_token}`;
      response = await fetch(`${getApiBaseUrl()}/metrics`, {
        method: "GET",
        headers,
        credentials: "include",
      });
    }
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return response.text();
}

// ============================================================================
// SIGNUP & PUBLIC WORKSPACE SELECTION (backend/app/api/auth.py)
// ============================================================================

export async function getPublicWorkspaces(): Promise<WorkspaceOption[]> {
  return apiFetch<WorkspaceOption[]>("/api/v1/auth/workspaces", {
    method: "GET",
    skipAuthRefresh: true,
  });
}

export async function signupUser(payload: SignUpRequest): Promise<SignUpResponse> {
  return apiFetch<SignUpResponse>("/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    skipAuthRefresh: true,
  });
}

// ============================================================================
// TRIAL STATUS & PROGRESS METERS (backend/app/api/tenants.py)
// ============================================================================

export async function getTrialStatus(tenantId: string): Promise<TrialStatusResponse> {
  return apiFetch<TrialStatusResponse>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/trial-status`,
    { method: "GET" }
  );
}

// ============================================================================
// TENANT ADMIN APPROVALS & MEMBER ACTIONS (backend/app/api/tenants.py)
// ============================================================================

export async function getPendingTenantMembers(
  tenantId: string
): Promise<PendingApprovalResponse[]> {
  return apiFetch<PendingApprovalResponse[]>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/pending-members`,
    { method: "GET" }
  );
}

export async function approveTenantMember(
  tenantId: string,
  userId: string
): Promise<MembershipResponse> {
  return apiFetch<MembershipResponse>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(userId)}/approve`,
    { method: "POST" }
  );
}

export async function rejectTenantMember(
  tenantId: string,
  userId: string
): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(userId)}/reject`,
    { method: "POST" }
  );
}

export async function deleteTenantMember(
  tenantId: string,
  userId: string
): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
}

// ============================================================================
// SUPERADMIN EXECUTIVE PLATFORM COMMAND CENTER (backend/app/api/superadmin.py)
// ============================================================================

export async function getSuperadminOverview(): Promise<SuperadminOverviewResponse> {
  return apiFetch<SuperadminOverviewResponse>("/api/v1/superadmin/overview", {
    method: "GET",
  });
}

export async function getAllTenantsSuperadmin(): Promise<TenantResponse[]> {
  return apiFetch<TenantResponse[]>("/api/v1/superadmin/tenants", {
    method: "GET",
  });
}

export async function createTenantSuperadmin(
  payload: TenantCreateRequest
): Promise<TenantResponse> {
  return apiFetch<TenantResponse>("/api/v1/superadmin/tenants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function approveTenantSuperadmin(tenantId: string): Promise<TenantResponse> {
  return apiFetch<TenantResponse>(
    `/api/v1/superadmin/tenants/${encodeURIComponent(tenantId)}/approve`,
    { method: "POST" }
  );
}

export async function rejectTenantSuperadmin(
  tenantId: string
): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>(
    `/api/v1/superadmin/tenants/${encodeURIComponent(tenantId)}/reject`,
    { method: "POST" }
  );
}

export async function getAllPendingMembersSuperadmin(): Promise<PendingApprovalResponse[]> {
  return apiFetch<PendingApprovalResponse[]>("/api/v1/superadmin/pending-members", {
    method: "GET",
  });
}

export async function superadminApproveMember(
  membershipId: string
): Promise<PendingApprovalResponse> {
  return apiFetch<PendingApprovalResponse>(
    `/api/v1/superadmin/members/${encodeURIComponent(membershipId)}/approve`,
    { method: "POST" }
  );
}

export async function superadminRejectMember(
  membershipId: string
): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>(
    `/api/v1/superadmin/members/${encodeURIComponent(membershipId)}/reject`,
    { method: "POST" }
  );
}

export async function getAllPlatformUsersSuperadmin(): Promise<PlatformUserResponse[]> {
  return apiFetch<PlatformUserResponse[]>("/api/v1/superadmin/users", {
    method: "GET",
  });
}

export async function superadminCreateUser(
  payload: SuperadminCreateUserRequest
): Promise<PlatformUserResponse> {
  return apiFetch<PlatformUserResponse>("/api/v1/superadmin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function superadminDeleteUser(
  userId: string
): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>(
    `/api/v1/superadmin/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    }
  );
}

export async function superadminDeleteTenant(
  tenantId: string
): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>(
    `/api/v1/superadmin/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: "DELETE",
    }
  );
}


