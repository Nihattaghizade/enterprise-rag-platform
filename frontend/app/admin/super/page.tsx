"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Crown,
  Database,
  FileText,
  FolderPlus,
  HelpCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { use_auth } from "@/lib/auth";
import {
  approveTenantSuperadmin,
  createTenantSuperadmin,
  getAllPendingMembersSuperadmin,
  getAllTenantsSuperadmin,
  getSuperadminOverview,
  rejectTenantSuperadmin,
  superadminApproveMember,
  superadminRejectMember,
} from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type {
  PendingApprovalResponse,
  SuperadminOverviewResponse,
  TenantResponse,
} from "@/types/api";
import { useToast } from "@/components/ui/toast";

export default function SuperadminConsolePage() {
  const router = useRouter();
  const { session, isAuthenticated, isSuperAdmin, isLoading: authLoading } =
    use_auth();
  const { pushToast } = useToast();

  const [overview, setOverview] = useState<SuperadminOverviewResponse | null>(null);
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingApprovalResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Tenant Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "tenants" | "approvals">("overview");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    } else if (!authLoading && isAuthenticated && !isSuperAdmin) {
      router.replace("/chat");
    }
  }, [authLoading, isAuthenticated, isSuperAdmin, router]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !isSuperAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [overviewData, tenantList, pendingList] = await Promise.all([
        getSuperadminOverview(),
        getAllTenantsSuperadmin(),
        getAllPendingMembersSuperadmin(),
      ]);
      setOverview(overviewData);
      setTenants(tenantList);
      setPendingMembers(pendingList);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch superadmin platform telemetry.");
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isSuperAdmin]);

  useEffect(() => {
    if (isAuthenticated && isSuperAdmin) {
      loadData();
    }
  }, [isAuthenticated, isSuperAdmin, loadData]);

  // Tenant Actions
  const handleApproveTenant = async (tenantId: string) => {
    try {
      await approveTenantSuperadmin(tenantId);
      pushToast({
        tone: "success",
        title: "Workspace Approved",
        description: "The workspace has been approved and activated.",
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      pushToast({ tone: "error", title: "Error", description: msg });
    }
  };

  const handleRejectTenant = async (tenantId: string) => {
    if (!confirm("Are you sure you want to reject and remove this workspace proposal?")) return;
    try {
      await rejectTenantSuperadmin(tenantId);
      pushToast({
        tone: "success",
        title: "Workspace Rejected",
        description: "The proposed workspace has been rejected and deleted.",
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rejection failed";
      pushToast({ tone: "error", title: "Error", description: msg });
    }
  };

  // Member Actions
  const handleApproveMember = async (membershipId: string) => {
    try {
      await superadminApproveMember(membershipId);
      pushToast({
        tone: "success",
        title: "Member Approved",
        description: "User membership application approved platform-wide.",
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      pushToast({ tone: "error", title: "Error", description: msg });
    }
  };

  const handleRejectMember = async (membershipId: string) => {
    if (!confirm("Reject and dismiss this membership application?")) return;
    try {
      await superadminRejectMember(membershipId);
      pushToast({
        tone: "success",
        title: "Member Rejected",
        description: "The membership application has been dismissed.",
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rejection failed";
      pushToast({ tone: "error", title: "Error", description: msg });
    }
  };

  // Create Tenant
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim() || !newTenantSlug.trim()) return;
    try {
      setCreatingTenant(true);
      await createTenantSuperadmin({
        name: newTenantName.trim(),
        slug: newTenantSlug.trim().toLowerCase(),
      });
      pushToast({
        tone: "success",
        title: "Workspace Provisioned",
        description: `Workspace "${newTenantName}" is now active.`,
      });
      setShowCreateModal(false);
      setNewTenantName("");
      setNewTenantSlug("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create workspace";
      pushToast({ tone: "error", title: "Error", description: msg });
    } finally {
      setCreatingTenant(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-medium text-slate-400">Loading Superadmin Command Center...</p>
        </div>
      </div>
    );
  }

  const pendingTenants = tenants.filter((t) => t.status === "pending");
  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-zinc-950 text-slate-100 p-6 sm:p-10 font-sans">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Top Header Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-purple-950/40 p-6 shadow-2xl backdrop-blur-xl">
          <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/20">
                <Crown className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-display">
                    Platform Superadmin Console
                  </h1>
                  <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-400/30">
                    UNIVERSAL ACCESS
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Global tenant orchestration, approvals queue, user governance, and infrastructure telemetry.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={loadData}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-600 hover:to-indigo-700"
              >
                <Plus className="h-4 w-4" />
                New Workspace
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-6 flex gap-2 border-t border-slate-800/80 pt-4 text-xs font-medium">
            <button
              onClick={() => setActiveTab("overview")}
              className={`rounded-lg px-3.5 py-1.5 transition ${
                activeTab === "overview"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              System Telemetry
            </button>
            <button
              onClick={() => setActiveTab("approvals")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${
                activeTab === "approvals"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <span>Pending Approvals</span>
              {((overview?.pending_approvals ?? 0) > 0) && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-slate-950">
                  {overview?.pending_approvals}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("tenants")}
              className={`rounded-lg px-3.5 py-1.5 transition ${
                activeTab === "tenants"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              Workspace Directory ({tenants.length})
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-300">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: OVERVIEW & SYSTEM TELEMETRY */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Workspaces</span>
                  <Building2 className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white font-display">
                  {overview?.total_tenants ?? 0}
                </div>
                <span className="mt-1 text-[11px] text-emerald-400 font-medium">
                  {overview?.active_tenants ?? 0} active
                </span>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Pending Action</span>
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-amber-400 font-display">
                  {overview?.pending_approvals ?? 0}
                </div>
                <span className="mt-1 text-[11px] text-slate-400">
                  Tenants & users
                </span>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Total Users</span>
                  <Users className="h-4 w-4 text-sky-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white font-display">
                  {overview?.total_users ?? 0}
                </div>
                <span className="mt-1 text-[11px] text-sky-400 font-medium">
                  Platform-wide
                </span>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Documents</span>
                  <FileText className="h-4 w-4 text-purple-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white font-display">
                  {overview?.total_documents ?? 0}
                </div>
                <span className="mt-1 text-[11px] text-purple-400 font-medium">
                  Indexed
                </span>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>AI Inquiries</span>
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white font-display">
                  {overview?.total_queries ?? 0}
                </div>
                <span className="mt-1 text-[11px] text-emerald-400 font-medium">
                  Queries logged
                </span>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Security Tier</span>
                  <ShieldCheck className="h-4 w-4 text-teal-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-teal-400 font-display">
                  Strict
                </div>
                <span className="mt-1 text-[11px] text-slate-400">
                  Multi-tenant RBAC
                </span>
              </div>
            </div>

            {/* Quick Action Alerts if pending items exist */}
            {((overview?.pending_approvals ?? 0) > 0) && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Clock className="mt-1 h-5 w-5 text-amber-400 shrink-0" />
                    <div>
                      <h3 className="font-semibold text-white">
                        {overview?.pending_approvals} Applications Awaiting Superadmin Decision
                      </h3>
                      <p className="mt-1 text-xs text-amber-200/80 leading-relaxed">
                        There are pending workspace creation proposals and member registrations requiring platform approval.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("approvals")}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-amber-400 shrink-0"
                  >
                    Open Approvals Queue
                  </button>
                </div>
              </div>
            )}

            {/* Platform Tenants Overview Table */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">Active Workspaces Overview</h3>
                <button
                  onClick={() => setActiveTab("tenants")}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  View All Directory &rarr;
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">Workspace Name</th>
                      <th className="py-2.5 px-3">Slug</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tenants.slice(0, 5).map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-3 font-semibold text-white">{t.name}</td>
                        <td className="py-3 px-3 font-mono text-slate-400">{t.slug}</td>
                        <td className="py-3 px-3">
                          {t.settings?.is_sandbox ? (
                            <span className="rounded bg-sky-950 text-sky-300 px-2 py-0.5 border border-sky-800/50">
                              Trial Sandbox
                            </span>
                          ) : (
                            <span className="rounded bg-indigo-950 text-indigo-300 px-2 py-0.5 border border-indigo-800/50">
                              Enterprise
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded px-2 py-0.5 font-medium ${
                              t.status === "active"
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800/50"
                                : "bg-amber-950 text-amber-300 border border-amber-800/50"
                            }`}
                          >
                            {t.status || "active"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400">{formatDateTime(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PENDING APPROVALS QUEUE */}
        {activeTab === "approvals" && (
          <div className="space-y-6">
            {/* Section A: Pending Workspace Proposals */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  Pending Workspace Creation Requests ({pendingTenants.length})
                </h3>
              </div>

              {pendingTenants.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center text-xs text-slate-400">
                  No workspace creation requests are currently awaiting approval.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-3">Workspace Name</th>
                        <th className="py-2.5 px-3">Slug</th>
                        <th className="py-2.5 px-3">Submitted</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {pendingTenants.map((pt) => (
                        <tr key={pt.id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-3 font-semibold text-white">{pt.name}</td>
                          <td className="py-3 px-3 font-mono text-slate-400">{pt.slug}</td>
                          <td className="py-3 px-3 text-slate-400">{formatDateTime(pt.created_at)}</td>
                          <td className="py-3 px-3 text-right space-x-2">
                            <button
                              onClick={() => handleApproveTenant(pt.id)}
                              className="rounded-lg bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-500 transition shadow"
                            >
                              Approve Workspace
                            </button>
                            <button
                              onClick={() => handleRejectTenant(pt.id)}
                              className="rounded-lg bg-rose-600/80 px-3 py-1 font-semibold text-white hover:bg-rose-500 transition"
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section B: Global Pending Member Applications */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  Cross-Workspace User Membership Requests ({pendingMembers.length})
                </h3>
              </div>

              {pendingMembers.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center text-xs text-slate-400">
                  No individual membership requests are pending approval across any workspace.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-3">Applicant Email</th>
                        <th className="py-2.5 px-3">Target Workspace</th>
                        <th className="py-2.5 px-3">Requested Role</th>
                        <th className="py-2.5 px-3">Applied</th>
                        <th className="py-2.5 px-3 text-right">Superadmin Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {pendingMembers.map((pm) => (
                        <tr key={pm.id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-3 font-semibold text-white">{pm.email}</td>
                          <td className="py-3 px-3 text-slate-300 font-medium">{pm.tenant_name}</td>
                          <td className="py-3 px-3">
                            <span className="rounded bg-indigo-950 text-indigo-300 px-2 py-0.5 border border-indigo-800/40 capitalize font-medium">
                              {pm.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-400">{formatDateTime(pm.created_at)}</td>
                          <td className="py-3 px-3 text-right space-x-2">
                            <button
                              onClick={() => handleApproveMember(pm.id)}
                              className="rounded-lg bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-500 transition shadow"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectMember(pm.id)}
                              className="rounded-lg bg-rose-600/80 px-3 py-1 font-semibold text-white hover:bg-rose-500 transition"
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: WORKSPACE DIRECTORY */}
        {activeTab === "tenants" && (
          <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-base font-bold text-white">All Platform Workspaces</h3>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or slug..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-3">Workspace</th>
                    <th className="py-3 px-3">Identifier / Slug</th>
                    <th className="py-3 px-3">Classification</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Created</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-3 font-semibold text-white">{t.name}</td>
                      <td className="py-3 px-3 font-mono text-slate-400">{t.slug}</td>
                      <td className="py-3 px-3">
                        {t.settings?.is_sandbox ? (
                          <span className="rounded bg-sky-950 text-sky-300 px-2 py-0.5 border border-sky-800/40">
                            Trial Sandbox (2 docs, 10 Qs)
                          </span>
                        ) : (
                          <span className="rounded bg-indigo-950 text-indigo-300 px-2 py-0.5 border border-indigo-800/40">
                            Enterprise Workspace
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`rounded px-2 py-0.5 font-medium ${
                            t.status === "active"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800/50"
                              : "bg-amber-950 text-amber-300 border border-amber-800/50"
                          }`}
                        >
                          {t.status || "active"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400">{formatDateTime(t.created_at)}</td>
                      <td className="py-3 px-3 text-right">
                        {t.status === "pending" ? (
                          <button
                            onClick={() => handleApproveTenant(t.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-500"
                          >
                            Approve
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Create Workspace */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white">Provision New Workspace</h3>
              <p className="mt-1 text-xs text-slate-400">
                Superadmin direct creation. The workspace will be active immediately.
              </p>

              <form onSubmit={handleCreateTenant} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Workspace Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newTenantName}
                    onChange={(e) => {
                      setNewTenantName(e.target.value);
                      if (!newTenantSlug) {
                        setNewTenantSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, "-")
                            .replace(/-+/g, "-")
                        );
                      }
                    }}
                    placeholder="e.g. Finance & Accounting"
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Slug (Unique URL identifier)
                  </label>
                  <input
                    type="text"
                    required
                    value={newTenantSlug}
                    onChange={(e) => setNewTenantSlug(e.target.value)}
                    placeholder="finance-accounting"
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingTenant}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {creatingTenant ? "Creating..." : "Create & Activate"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
