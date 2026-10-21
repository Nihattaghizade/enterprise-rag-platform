"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { getPublicWorkspaces, signupUser } from "@/lib/api";
import type { WorkspaceOption } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RoleSelection = "trial_viewer" | "viewer" | "editor" | "admin";
type AdminMode = "existing" | "new";

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<RoleSelection>("trial_viewer");

  // Workspaces state
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [adminMode, setAdminMode] = useState<AdminMode>("existing");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    requiresApproval: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    // Reset inputs on mount/page navigation
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setNewWorkspaceName("");
    setErrorMessage(null);

    async function fetchWorkspaces() {
      try {
        setLoadingWorkspaces(true);
        const list = await getPublicWorkspaces();
        setWorkspaces(list);
        if (list.length > 0) {
          setSelectedWorkspaceId(list[0].id);
        }
      } catch {
        setWorkspaces([]);
      } finally {
        setLoadingWorkspaces(false);
      }
    }
    fetchWorkspaces();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if ((role === "viewer" || role === "editor") && !selectedWorkspaceId) {
      setErrorMessage("Please select a workspace for your account.");
      return;
    }

    if (role === "admin") {
      if (adminMode === "new" && !newWorkspaceName.trim()) {
        setErrorMessage("Please specify the name of the new workspace to create.");
        return;
      }
      if (adminMode === "existing" && !selectedWorkspaceId) {
        setErrorMessage("Please select the existing workspace you wish to join.");
        return;
      }
    }

    try {
      setLoading(true);
      const res = await signupUser({
        email: trimmedEmail,
        password,
        role,
        tenant_id:
          role === "trial_viewer"
            ? null
            : role === "admin" && adminMode === "new"
            ? null
            : selectedWorkspaceId || null,
        new_tenant_name:
          role === "admin" && adminMode === "new"
            ? newWorkspaceName.trim()
            : null,
      });

      setSuccessResult({
        requiresApproval: res.requires_approval,
        message: res.message,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("An unexpected error occurred during signup.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mesh-surface flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-elevated border-border">
        <CardHeader className="space-y-2.5 text-center sm:text-left">
          <div className="mx-auto sm:mx-0 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl font-display">
            Create an Account
          </CardTitle>
          <CardDescription>
            Select your role and workspace to get started.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {successResult ? (
            <div className="space-y-4">
              <div
                className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
                  successResult.requiresApproval
                    ? "border-warning/30 bg-warning/10 text-foreground"
                    : "border-success/30 bg-success/10 text-foreground"
                }`}
              >
                {successResult.requiresApproval ? (
                  <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-foreground">
                    {successResult.requiresApproval
                      ? "Awaiting Administrator Approval"
                      : "Account Created Successfully!"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {successResult.message}
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                Proceed to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
              {errorMessage && (
                <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Email Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Work Email
                </label>
                <Input
                  type="email"
                  name="signup_account_email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="off"
                  disabled={loading}
                />
              </div>

              {/* Account Role */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Account Type / Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as RoleSelection)}
                  disabled={loading}
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <option value="trial_viewer">
                    Trial Viewer (Instant Evaluation Sandbox)
                  </option>
                  <option value="viewer">Viewer (Read-only Member)</option>
                  <option value="editor">Editor (Document Contributor)</option>
                  <option value="admin">Admin (Workspace Administrator)</option>
                </select>
              </div>

              {/* Role Context Notes */}
              {role === "trial_viewer" && (
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                  <div>
                    <span className="font-semibold text-primary">Instant Sandbox:</span> No administrator approval required. You will be provisioned a personal test workspace limited to 2 files and 10 queries.
                  </div>
                </div>
              )}

              {(role === "viewer" || role === "editor") && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Select Workspace
                  </label>
                  {loadingWorkspaces ? (
                    <div className="h-10 rounded-md border border-border bg-surface-muted animate-pulse" />
                  ) : workspaces.length > 0 ? (
                    <select
                      value={selectedWorkspaceId}
                      onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                      disabled={loading}
                      className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {workspaces.map((ws) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No active workspaces available. An administrator must create a workspace first.
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Your request will require approval from the workspace administrator before you can sign in.
                  </p>
                </div>
              )}

              {role === "admin" && (
                <div className="space-y-3 rounded-lg border border-border bg-surface-muted/30 p-3.5">
                  <div className="grid grid-cols-2 gap-1.5 rounded-md bg-surface-muted p-1 border border-border">
                    <button
                      type="button"
                      onClick={() => setAdminMode("existing")}
                      className={`rounded py-1 text-xs font-medium transition-colors ${
                        adminMode === "existing"
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Join Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminMode("new")}
                      className={`rounded py-1 text-xs font-medium transition-colors ${
                        adminMode === "new"
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Create New
                    </button>
                  </div>

                  {adminMode === "existing" ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Workspace Name
                      </label>
                      <select
                        value={selectedWorkspaceId}
                        onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                        disabled={loading}
                        className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        {workspaces.map((ws) => (
                          <option key={ws.id} value={ws.id}>
                            {ws.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        Requires approval from the workspace admin or superadmin.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        New Workspace Name
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. Acme Corp or Legal Department"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        disabled={loading}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        New workspaces are submitted to platform superadmins for approval.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Password
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-2"
                disabled={loading}
              >
                {loading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>
          )}

          {!successResult && (
            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-primary hover:underline"
                >
                  Sign In
                </Link>
              </p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3 border-t border-border-subtle bg-surface-muted/30 px-6 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Protected by Role-Based Access Control</span>
          </div>
          <span className="text-xs text-muted-foreground">Encrypted Session</span>
        </CardFooter>
      </Card>
    </div>
  );
}
