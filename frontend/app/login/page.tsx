"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { use_auth } from "@/lib/auth";
import { ApiRequestError } from "@/types/api";
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
import { useToast } from "@/components/ui/toast";

type LoginPhase = "idle" | "authenticating" | "initializing";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = use_auth();
  const { pushToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginPhase, setLoginPhase] = useState<LoginPhase>("idle");
  const [authenticatedRole, setAuthenticatedRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    // Unconditionally ensure inputs are empty on mount/navigation
    setEmail("");
    setPassword("");
    setErrorMessage(null);
    setLoginPhase("idle");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (trimmedEmail.length < 3) {
      setErrorMessage("Please enter a valid work email address.");
      return;
    }
    if (password.length < 1) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setUserEmail(trimmedEmail);
    setLoginPhase("authenticating");

    try {
      const tokenRes = await signIn({
        email: trimmedEmail,
        password,
      });

      setAuthenticatedRole(tokenRes.role);
      setLoginPhase("initializing");

      pushToast({
        tone: "success",
        title: "Welcome back",
        description: `Signed in with ${tokenRes.role} access.`,
      });

      const targetPath = tokenRes.role === "superadmin" ? "/admin/super" : "/chat";
      router.prefetch(targetPath);

      // Brief wait time interval so the visual loading sub-screen is smoothly visible
      await new Promise((resolve) => setTimeout(resolve, 600));

      router.push(targetPath);
    } catch (err) {
      setLoginPhase("idle");
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(
          "Unable to connect to the authentication service. Please check your connection."
        );
      }
    }
  };

  // --- VISUAL LOADING SUB-SCREEN DURING SIGN IN WAIT TIME INTERVAL ---
  if (loginPhase !== "idle") {
    return (
      <div className="mesh-surface flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6">
        <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-elevated/95 p-8 shadow-elevated backdrop-blur-xl animate-in fade-in-50 zoom-in-95 duration-300">
          {/* Ambient luminous glow circles */}
          <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col items-center text-center space-y-6">
            {/* Center Emblem with animated spinning halo */}
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-2xl border-2 border-primary/20 border-t-primary animate-spin" />
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary-hover text-primary-foreground shadow-lg shadow-primary/25">
                <Sparkles className="h-7 w-7 animate-pulse" />
              </div>
            </div>

            {/* Title & Subtitle */}
            <div className="space-y-2">
              <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">
                {loginPhase === "authenticating"
                  ? "Authenticating Session..."
                  : "Initializing Workspace..."}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {loginPhase === "authenticating"
                  ? "Verifying organizational credentials against security policies..."
                  : `Preparing workspace interface for ${userEmail || "user"}. Connecting encrypted session...`}
              </p>
            </div>

            {/* Stepped Progress Checklist Sub-Screen */}
            <div className="w-full space-y-3 rounded-xl border border-border-subtle bg-surface/70 p-4 text-left text-xs shadow-inner">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-foreground font-medium">
                  {loginPhase === "authenticating" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                  <span>Identity Verification</span>
                </span>
                <span
                  className={`text-[11px] font-mono ${
                    loginPhase === "authenticating"
                      ? "text-primary animate-pulse"
                      : "text-emerald-400 font-semibold"
                  }`}
                >
                  {loginPhase === "authenticating" ? "Verifying..." : "Verified"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-foreground font-medium">
                  {loginPhase === "initializing" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    </span>
                  )}
                  <span>Workspace & Role Resolution</span>
                </span>
                <span className="text-[11px] font-mono text-muted-foreground capitalize">
                  {loginPhase === "initializing"
                    ? authenticatedRole || "Authorized"
                    : "Pending"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-foreground font-medium">
                  <span className="flex h-4 w-4 items-center justify-center">
                    <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                  </span>
                  <span>Interface Launch</span>
                </span>
                <span className="text-[11px] font-mono text-primary animate-pulse">
                  Opening...
                </span>
              </div>
            </div>

            {/* Loading Progress Bar */}
            <div className="w-full space-y-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary-hover transition-all duration-500 ease-out"
                  style={{
                    width: loginPhase === "authenticating" ? "45%" : "100%",
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 font-mono">
                <span>VERITAS INTEL</span>
                <span>CRYPTOGRAPHICALLY ISOLATED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- STANDARD LOGIN FORM ---
  return (
    <div className="mesh-surface flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-elevated border-border">
        <CardHeader className="space-y-2.5 text-center sm:text-left">
          <div className="mx-auto sm:mx-0 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl font-display">
            Sign in to Veritas AI
          </CardTitle>
          <CardDescription>
            Enter your organization credentials to access your knowledge
            workspace.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Work Email
              </label>
              <Input
                type="email"
                name="login_user_account_email"
                required
                minLength={3}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Password
              </label>
              <Input
                type="password"
                name="login_user_account_password"
                required
                minLength={1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="new-password"
              />
            </div>

            {errorMessage && (
              <div
                className={`rounded-xl border p-3.5 text-xs ${
                  errorMessage.toLowerCase().includes("awaiting approval") ||
                  errorMessage.toLowerCase().includes("pending approval")
                    ? "border-amber-500/40 bg-amber-950/30 text-amber-200"
                    : "border-danger/40 bg-danger/10 text-danger"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 text-base">⚠️</div>
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {errorMessage.toLowerCase().includes("awaiting approval")
                        ? "Account Pending Approval"
                        : "Sign In Failed"}
                    </p>
                    <p className="leading-relaxed">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
            >
              Sign In to Workspace
            </Button>

            <div className="pt-2 text-center">
              <p className="text-xs text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="font-medium text-primary hover:underline"
                >
                  Create an account
                </Link>
              </p>
            </div>
          </form>
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
