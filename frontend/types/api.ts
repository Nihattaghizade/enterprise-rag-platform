export type RoleType = "superadmin" | "admin" | "editor" | "viewer" | "trial_viewer";

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

export interface LoginRequest {
  email: string;
  password: string;
  tenant_id?: string | null;
}

export interface RefreshRequest {
  refresh_token?: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  tenant_id: string;
  role: RoleType;
}

export interface LogoutResponse {
  status: string;
}

export interface WorkspaceOption {
  id: string;
  name: string;
  slug: string;
}

export interface SignUpRequest {
  email: string;
  password: string;
  role: "trial_viewer" | "viewer" | "editor" | "admin";
  tenant_id?: string | null;
  new_tenant_name?: string | null;
}

export interface SignUpResponse {
  status: string;
  requires_approval: boolean;
  message: string;
  user_id: string;
  tenant_id?: string | null;
  role: RoleType;
}

export interface TenantCreateRequest {
  name: string;
  slug: string;
  settings?: Record<string, unknown> | null;
}

export interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  status?: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberAddRequest {
  email: string;
  role: "admin" | "editor" | "viewer";
  password?: string | null;
}

export interface MemberRoleUpdateRequest {
  role: "admin" | "editor" | "viewer";
}

export interface MembershipResponse {
  id: string;
  user_id: string;
  tenant_id: string;
  role: RoleType;
  status: string;
  email?: string | null;
  tenant_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendingApprovalResponse {
  id: string;
  user_id: string;
  email: string;
  role: RoleType;
  tenant_id: string;
  tenant_name: string;
  status: string;
  created_at: string;
}

export interface TrialStatusResponse {
  is_trial: boolean;
  documents_uploaded: number;
  max_documents: number;
  questions_asked: number;
  max_questions: number;
}

export interface SuperadminOverviewResponse {
  total_tenants: number;
  active_tenants: number;
  pending_tenants: number;
  total_users: number;
  pending_approvals: number;
  total_documents: number;
  total_queries: number;
}

export interface HealthLivenessResponse {
  status: string;
}

export interface HealthReadinessResponse {
  status: string;
}
