"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Building2,
  Plus,
  RefreshCw,
  Shield,
  UserPlus,
} from "lucide-react";
import { use_auth } from "@/lib/auth";
import {
  add_tenant_member,
  create_tenant,
  get_prometheus_metrics,
  list_tenant_members,
  list_tenants,
  update_tenant_member_role,
} from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import {
  ApiRequestError,
  type MembershipResponse,
  type RoleType,
  type TenantResponse,
} from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

export default function AdminTenantsPage() {
  const router = useRouter();
  const { session, isAuthenticated, isAdmin, isLoading: authLoading } =
    use_auth();
  const { pushToast } = useToast();

  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [members, setMembers] = useState<MembershipResponse[]>([]);
  const [metricsText, setMetricsText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Tenant Form (`POST /api/v1/tenants`)
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);

  // Add Member Form (`POST /api/v1/tenants/{tenant_id}/members`)
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<RoleType>("viewer");
  const [memberPassword, setMemberPassword] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const loadAdminData = useCallback(async () => {
    if (!isAuthenticated || !isAdmin || !session?.tenant_id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [tenantList, memberList, rawMetrics] = await Promise.all([
        list_tenants(),
        list_tenant_members(session.tenant_id),
        get_prometheus_metrics(),
      ]);
      setTenants(tenantList);
      setMembers(memberList);
      setMetricsText(rawMetrics);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`${err.message} (${err.code})`);
      } else {
        setError("Failed to load tenant administration data.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isAdmin, session?.tenant_id]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadAdminData();
    }
  }, [isAuthenticated, isAdmin, loadAdminData]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = tenantName.trim();
    const trimmedSlug = tenantSlug.trim();

    if (trimmedName.length < 2 || trimmedName.length > 120) {
      pushToast({
        tone: "error",
        title: "Validation Error",
        description: "Tenant name must be between 2 and 120 characters.",
      });
      return;
    }
    if (trimmedSlug.length < 2 || trimmedSlug.length > 64) {
      pushToast({
        tone: "error",
        title: "Validation Error",
        description: "Tenant slug must be between 2 and 64 characters.",
      });
      return;
    }

    setCreatingTenant(true);
    try {
      const created = await create_tenant({
        name: trimmedName,
        slug: trimmedSlug,
        settings: {},
      });
      pushToast({
        tone: "success",
        title: "201 Created — Tenant Provisioned",
        description: `Created "${created.name}" (${created.slug}) with id ${created.id}.`,
      });
      setTenantName("");
      setTenantSlug("");
      await loadAdminData();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: `Create Tenant Failed (${err.code})`,
          description: err.message,
          requestId: err.request_id,
        });
      }
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.tenant_id) return;

    const trimmedEmail = memberEmail.trim();
    if (trimmedEmail.length < 3) {
      pushToast({
        tone: "error",
        title: "Validation Error",
        description: "Member email must be at least 3 characters.",
      });
      return;
    }
    if (memberPassword.length > 0 && memberPassword.length < 8) {
      pushToast({
        tone: "error",
        title: "Validation Error",
        description:
          "Password must be at least 8 characters when creating a new user (`min_length=8`).",
      });
      return;
    }

    setAddingMember(true);
    try {
      const created = await add_tenant_member(session.tenant_id, {
        email: trimmedEmail,
        role: memberRole,
        password: memberPassword.length > 0 ? memberPassword : null,
      });
      pushToast({
        tone: "success",
        title: "201 Created — Member Added",
        description: `User ${created.user_id.slice(
          0,
          8
        )} added with role "${created.role}".`,
      });
      setMemberEmail("");
      setMemberPassword("");
      await loadAdminData();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: `Add Member Failed (${err.code})`,
          description: err.message,
          requestId: err.request_id,
        });
      }
    } finally {
      setAddingMember(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: RoleType) => {
    if (!session?.tenant_id) return;
    setUpdatingUserId(userId);
    try {
      const updated = await update_tenant_member_role(
        session.tenant_id,
        userId,
        { role: newRole }
      );
      pushToast({
        tone: "success",
        title: "Member Role Updated",
        description: `User ${updated.user_id.slice(0, 8)} is now "${
          updated.role
        }".`,
      });
      await loadAdminData();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: `Role Update Failed (${err.code})`,
          description: err.message,
          requestId: err.request_id,
        });
      }
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-10 w-10 text-danger" />
            <h2 className="mt-3 font-display text-xl font-semibold">
              403 Forbidden — Admin Role Required
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              `/api/v1/tenants/*` and `/metrics` require `Depends(require_roles(&quot;admin&quot;))`.
              Your current session role is `{session?.role}`.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Tenant Administration, RBAC & Prometheus Telemetry
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage workspaces (`GET/POST /api/v1/tenants`), tenant memberships
            (`GET/POST/PATCH /api/v1/tenants/&#123;id&#125;/members`), and live
            Prometheus metrics (`GET /metrics`).
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={loadAdminData}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh All
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadAdminData}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* CURRENT TENANT WORKSPACE & CREATE TENANT */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Active Tenant Workspace (`GET /api/v1/tenants`)
                </CardTitle>
                <CardDescription>
                  Returns the workspace matching your authenticated JWT
                  `tenant_id`.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {tenants.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-base font-semibold text-foreground">
                        {t.name}
                      </span>
                      <Badge variant={t.is_active ? "success" : "danger"}>
                        {t.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="font-mono text-muted-foreground">
                      slug: {t.slug} · id: {t.id}
                    </p>
                    <p className="text-muted-foreground">
                      Created: {formatDateTime(t.created_at)}
                    </p>
                  </div>
                ))}

                <form
                  onSubmit={handleCreateTenant}
                  className="space-y-3 border-t border-border-subtle pt-4"
                >
                  <p className="text-xs font-semibold text-foreground">
                    Provision Additional Workspace (`POST /api/v1/tenants`)
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Input
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="Workspace Name (2..120 chars)"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                    <Input
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      placeholder="workspace-slug (2..64 chars)"
                      required
                      minLength={2}
                      maxLength={64}
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    isLoading={creatingTenant}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create Tenant Workspace
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* ADD MEMBER FORM */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Add Workspace Member (`POST /api/v1/tenants/&#123;id&#125;/members`)
                </CardTitle>
                <CardDescription>
                  Adds an existing user by email or creates a new user account if
                  `password` (`min_length=8`) is provided.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddMember} className="space-y-3.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      User Email (`min_length=3`)
                    </label>
                    <Input
                      type="email"
                      required
                      minLength={3}
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      placeholder="analyst@enterprise.internal"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Assigned Role (`admin | editor | viewer`)
                      </label>
                      <select
                        value={memberRole}
                        onChange={(e) =>
                          setMemberRole(e.target.value as RoleType)
                        }
                        className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="viewer">viewer</option>
                        <option value="editor">editor</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Initial Password (`min_length=8` if new user)
                      </label>
                      <Input
                        type="password"
                        minLength={8}
                        value={memberPassword}
                        onChange={(e) => setMemberPassword(e.target.value)}
                        placeholder="Required if user is new"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={addingMember}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add Member to Tenant
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* MEMBERS TABLE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Workspace Memberships (`GET & PATCH /api/v1/tenants/&#123;id&#125;/members`)
              </CardTitle>
              <CardDescription>
                {members.length} member(s) in tenant `{session?.tenant_id}`.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/60 text-xs font-medium text-muted-foreground">
                      <th className="px-4 py-2.5">Membership ID</th>
                      <th className="px-4 py-2.5">User ID</th>
                      <th className="px-4 py-2.5">Current Role</th>
                      <th className="px-4 py-2.5">Updated At</th>
                      <th className="px-4 py-2.5 text-right">
                        Change Role (`PATCH`)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {members.map((m) => (
                      <tr key={m.id} className="text-xs">
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {m.id}
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-foreground">
                          {m.user_id}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="primary"
                            className="uppercase font-mono"
                          >
                            {m.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDateTime(m.updated_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <select
                            disabled={updatingUserId === m.user_id}
                            value={m.role}
                            onChange={(e) =>
                              handleRoleChange(
                                m.user_id,
                                e.target.value as RoleType
                              )
                            }
                            aria-label={`Change role for ${m.user_id}`}
                            className="rounded border border-border bg-surface-elevated px-2.5 py-1 font-mono text-xs text-foreground"
                          >
                            <option value="admin">admin</option>
                            <option value="editor">editor</option>
                            <option value="viewer">viewer</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* PROMETHEUS METRICS EXPOSITION */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Live Prometheus Metrics (`GET /metrics`)
              </CardTitle>
              <CardDescription>
                Admin-protected Prometheus exposition from
                `backend/app/api/health.py:42-47` (`http_requests_total`,
                `rag_stage_latency_seconds`, `rag_cache_events_total`,
                `rag_llm_tokens_total`).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-80 overflow-y-auto rounded-lg border border-border bg-surface-elevated p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {metricsText || "No metrics exposition output."}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
