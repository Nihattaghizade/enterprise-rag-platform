// Exact TypeScript mirrors of backend Pydantic schemas in:
// - backend/app/schemas/auth.py:7-27
// - backend/app/schemas/tenants.py:8-42
// - backend/app/core/errors.py:33-38
// - backend/app/core/permissions.py:6

export type RoleType = "admin" | "editor" | "viewer";

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details: Record<string, unknown>;
  request_id: string | null;
}

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: Record<string, unknown>;
  public readonly request_id: string | null;

  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.message || `HTTP Error ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = envelope.code;
    this.details = envelope.details || {};
    this.request_id = envelope.request_id ?? null;
  }
}

// Mirrors LoginRequest (backend/app/schemas/auth.py:7-10)
export interface LoginRequest {
  email: string; // min_length=3
  password: string; // min_length=1
  tenant_id?: string | null;
}

// Mirrors RefreshRequest (backend/app/schemas/auth.py:13-14)
export interface RefreshRequest {
  refresh_token?: string | null;
}

// Mirrors TokenResponse (backend/app/schemas/auth.py:17-23)
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string; // default "bearer"
  user_id: string;
  tenant_id: string;
  role: RoleType;
}

// Mirrors LogoutResponse (backend/app/schemas/auth.py:26-27)
export interface LogoutResponse {
  status: string; // "logged_out"
}

// Mirrors TenantCreateRequest (backend/app/schemas/tenants.py:8-11)
export interface TenantCreateRequest {
  name: string; // min_length=2, max_length=120
  slug: string; // min_length=2, max_length=64
  settings?: Record<string, unknown> | null;
}

// Mirrors TenantResponse (backend/app/schemas/tenants.py:14-23)
export interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Mirrors MemberAddRequest (backend/app/schemas/tenants.py:26-29)
export interface MemberAddRequest {
  email: string; // min_length=3
  role: RoleType; // "admin" | "editor" | "viewer"
  password?: string | null; // min_length=8 when creating a new user account
}

// Mirrors MemberRoleUpdateRequest (backend/app/schemas/tenants.py:32-33)
export interface MemberRoleUpdateRequest {
  role: RoleType; // "admin" | "editor" | "viewer"
}

// Mirrors MembershipResponse (backend/app/schemas/tenants.py:36-42)
export interface MembershipResponse {
  id: string;
  user_id: string;
  tenant_id: string;
  role: RoleType;
  created_at: string;
  updated_at: string;
}

// Mirrors /health (backend/app/api/health.py:14-17)
export interface HealthLivenessResponse {
  status: string; // "ok"
}

// Mirrors /ready (backend/app/api/health.py:20-39)
export interface HealthReadinessResponse {
  status: string; // "ready"
}
