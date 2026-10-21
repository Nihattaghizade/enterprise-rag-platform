"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { use_auth } from "@/lib/auth";
import {
  add_tenant_member,
  approveTenantMember,
  deleteTenantMember,
  get_prometheus_metrics,
  get_tenant,
  getPendingTenantMembers,
  list_tenant_members,
  rejectTenantMember,
  update_tenant_member_role,
} from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import {
  ApiRequestError,
  type MembershipResponse,
  type PendingApprovalResponse,
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
  const [pendingMembers, setPendingMembers] = useState<PendingApprovalResponse[]>([]);
  const [metricsText, setMetricsText] = useState<string>("");
  const [showMetrics, setShowMetrics] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [memberPassword, setMemberPassword] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    // Reset add member inputs on mount/route transition
    setMemberEmail("");
    setMemberPassword("");
  }, []);

  const loadAdminData = useCallback(async () => {
    if (!isAuthenticated || !isAdmin || !session?.tenant_id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [currentTenant, memberList, pendingList, rawMetrics] = await Promise.all([
        get_tenant(session.tenant_id),
        list_tenant_members(session.tenant_id),
        getPendingTenantMembers(session.tenant_id),
        get_prometheus_metrics(),
      ]);
      setTenants([currentTenant]);
      setMembers(memberList);
      setPendingMembers(pendingList);
      setMetricsText(rawMetrics);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError("Unable to load workspace administration data.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isAdmin, session?.tenant_id]);

  const handleApproveMember = async (userId: string) => {
    if (!session?.tenant_id) return;
    try {
      await approveTenantMember(session.tenant_id, userId);
      pushToast({
        tone: "success",
        title: "Member Approved",
        description: "Membership request approved successfully.",
      });
      await loadAdminData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      pushToast({ tone: "error", title: "Error", description: msg });
    }
  };

  const handleRejectMember = async (userId: string) => {
    if (!session?.tenant_id) return;
    try {
      await rejectTenantMember(session.tenant_id, userId);
      pushToast({
        tone: "success",
        title: "Request Rejected",
        description: "Membership request has been dismissed.",
      });
      await loadAdminData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rejection failed";
      pushToast({ tone: "error", title: "Error", description: msg });
    }
  };

  const handleDeleteMember = async (userId: string) => {
    if (!session?.tenant_id) return;
    if (!confirm("Are you sure you want to remove this member from the workspace?")) return;
    try {
      await deleteTenantMember(session.tenant_id, userId);
      pushToast({
        tone: "success",
        title: "Member Removed",
        description: "Member has been removed from this workspace.",
      });
      await loadAdminData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      pushToast({ tone: "error", title: "Error", description: msg });
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadAdminData();
    }
  }, [isAuthenticated, isAdmin, loadAdminData]);


  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.tenant_id) return;

    const trimmedEmail = memberEmail.trim();
    if (trimmedEmail.length < 3) {
      pushToast({
        tone: "error",
        title: "Invalid Email",
        description: "Please enter a valid work email address.",
      });
      return;
    }
    if (memberPassword.length > 0 && memberPassword.length < 8) {
      pushToast({
        tone: "error",
        title: "Password Too Short",
        description: "Password must be at least 8 characters.",
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
        title: "Team Member Added",
        description: `${trimmedEmail} now has ${created.role} access to this workspace.`,
      });
      setMemberEmail("");
      setMemberPassword("");
      await loadAdminData();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: "Unable to Add Member",
          description: err.message,
        });
      }
    } finally {
      setAddingMember(false);
    }
  };

  const handleRoleChange = async (
    userId: string,
    newRole: "admin" | "editor" | "viewer"
  ) => {
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
        title: "Access Role Updated",
        description: `Member role updated to ${updated.role}.`,
      });
      await loadAdminData();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        pushToast({
          tone: "error",
          title: "Unable to Update Role",
          description: err.message,
        });
      }
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-10 w-10 text-danger" />
            <h2 className="mt-3 font-display text-xl font-semibold text-foreground">
              Administrator Access Required
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Only workspace administrators can manage organization settings and
              team permissions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 sm:p-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
            Workspace & Team Administration
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage organization workspaces, invite team members, and configure
            role-based access controls.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={loadAdminData}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadAdminData}>
            Try Again
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* CURRENT WORKSPACE DETAILS */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Workspace Details
                </CardTitle>
                <CardDescription>
                  View your active workspace configuration and identifiers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[360px] overflow-y-auto space-y-3 pr-1.5">
                  {tenants.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-border-subtle bg-surface-elevated p-4 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-base font-semibold text-foreground">
                          {t.name}
                        </span>
                        <Badge variant={t.is_active ? "success" : "danger"}>
                          {t.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">
                        Slug:{" "}
                        <span className="font-mono text-foreground">{t.slug}</span>{" "}
                        · Created {formatDateTime(t.created_at)}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        Workspace ID: {t.id}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* INVITE / ADD TEAM MEMBER */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Add Team Member
                </CardTitle>
                <CardDescription>
                  Grant workspace access to an existing user or create a new
                  team account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddMember} autoComplete="off" className="space-y-3.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                      Work Email
                    </label>
                    <Input
                      type="email"
                      name="new_member_workspace_email"
                      autoComplete="off"
                      required
                      minLength={3}
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      placeholder="colleague@company.com"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Access Role
                      </label>
                      <select
                        value={memberRole}
                        onChange={(e) =>
                          setMemberRole(
                            e.target.value as "admin" | "editor" | "viewer"
                          )
                        }
                        className="h-10 w-full rounded-lg border border-border bg-surface-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="viewer">Viewer (Search & Read)</option>
                        <option value="editor">
                          Editor (Upload & Manage Docs)
                        </option>
                        <option value="admin">
                          Admin (Full Workspace Control)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Initial Password (for new accounts)
                      </label>
                      <Input
                        type="password"
                        name="new_member_workspace_password"
                        autoComplete="new-password"
                        minLength={8}
                        value={memberPassword}
                        onChange={(e) => setMemberPassword(e.target.value)}
                        placeholder="8+ characters if new user"
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
                    Add Member
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* PENDING APPROVAL REQUESTS */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                    Pending Member Applications
                  </CardTitle>
                  <CardDescription>
                    Review registration requests submitted for this workspace.
                  </CardDescription>
                </div>
                <Badge variant={pendingMembers.length > 0 ? "warning" : "default"}>
                  {pendingMembers.length} {pendingMembers.length === 1 ? "Pending" : "Pending"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {pendingMembers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-surface-elevated/50 p-6 text-center text-xs text-muted-foreground">
                  No pending membership applications for this workspace.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto pr-1">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-muted/60 text-xs font-medium text-muted-foreground">
                        <th className="px-4 py-2.5">Applicant Email</th>
                        <th className="px-4 py-2.5">Requested Role</th>
                        <th className="px-4 py-2.5">Application Date</th>
                        <th className="px-4 py-2.5 text-right">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {pendingMembers.map((pm) => (
                        <tr key={pm.id} className="text-xs">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {pm.email}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="primary" className="capitalize">
                              {pm.role}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDateTime(pm.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleApproveMember(pm.user_id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleRejectMember(pm.user_id)}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TEAM MEMBERS TABLE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Workspace Members & Permissions
              </CardTitle>
              <CardDescription>
                {members.length} active{" "}
                {members.length === 1 ? "member" : "members"} in this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto pr-1">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/60 text-xs font-medium text-muted-foreground">
                      <th className="px-4 py-2.5">Member Email / ID</th>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5">Last Updated</th>
                      <th className="px-4 py-2.5 text-right">
                        Actions & Role
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {members.map((m) => (
                      <tr key={m.id} className="text-xs">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {m.email || m.user_id}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="primary" className="capitalize">
                            {m.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDateTime(m.updated_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              disabled={updatingUserId === m.user_id}
                              value={m.role}
                              onChange={(e) =>
                                handleRoleChange(
                                  m.user_id,
                                  e.target.value as "admin" | "editor" | "viewer"
                                )
                              }
                              aria-label={`Change role for ${m.user_id}`}
                              className="rounded-lg border border-border bg-surface-elevated px-2.5 py-1 text-xs font-medium text-foreground"
                            >
                              <option value="admin">Admin</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteMember(m.user_id)}
                              className="text-muted-foreground hover:text-danger hover:bg-danger/10"
                              title="Remove member from workspace"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* COLLAPSIBLE SYSTEM TELEMETRY */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Platform Telemetry & Performance Metrics
                </CardTitle>
                <CardDescription>
                  Real-time request throughput, cache efficiency, and AI token
                  utilization.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMetrics((v) => !v)}
              >
                {showMetrics ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Hide Raw Telemetry
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    View Raw Telemetry
                  </>
                )}
              </Button>
            </CardHeader>
            {showMetrics && (
              <CardContent>
                <pre className="max-h-80 overflow-y-auto rounded-xl border border-border bg-surface-elevated p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {metricsText || "No telemetry data available."}
                </pre>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
