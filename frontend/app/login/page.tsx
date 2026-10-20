"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = use_auth();
  const { pushToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorCode(null);
    setRequestId(null);

    const trimmedEmail = email.trim();
    if (trimmedEmail.length < 3) {
      setErrorMessage("Email must be at least 3 characters (min_length=3).");
      return;
    }
    if (password.length < 1) {
      setErrorMessage("Password is required (min_length=1).");
      return;
    }
    const trimmedTenant = tenantId.trim();
    if (trimmedTenant.length > 0 && !UUID_REGEX.test(trimmedTenant)) {
      setErrorMessage(
        "Optional Tenant ID must be a valid UUID format if provided."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const tokenRes = await signIn({
        email: trimmedEmail,
        password,
        tenant_id: trimmedTenant.length > 0 ? trimmedTenant : null,
      });

      pushToast({
        tone: "success",
        title: "Authenticated",
        description: `Signed in with role "${tokenRes.role}" in tenant ${tokenRes.tenant_id.slice(
          0,
          8
        )}.`,
      });

      router.push("/chat");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
        setErrorCode(err.code);
        setRequestId(err.request_id);
      } else {
        setErrorMessage("Unable to reach backend authentication service.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mesh-surface flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="space-y-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyRound className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl">Sign In to Workspace</CardTitle>
          <CardDescription>
            Authenticates via `POST /api/v1/auth/login` and establishes your
            tenant-scoped JWT + `HttpOnly` session cookies.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Work Email (`min_length=3`)
              </label>
              <Input
                type="email"
                required
                minLength={3}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@enterprise.internal"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Password (`min_length=1`)
              </label>
              <Input
                type="password"
                required
                minLength={1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Target Workspace `tenant_id` (Optional UUID)
              </label>
              <Input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="Leave blank to use primary tenant membership"
                className="font-mono text-xs"
              />
            </div>

            {errorMessage && (
              <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger space-y-1">
                <p className="font-semibold">
                  {errorMessage} {errorCode ? `(${errorCode})` : ""}
                </p>
                {requestId && (
                  <p className="font-mono text-[10px] opacity-80">
                    request_id: {requestId}
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isSubmitting}
            >
              <Lock className="h-4 w-4" />
              Authenticate & Enter Workspace
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Bcrypt + HS256 JWT
          </span>
          <span className="font-mono">Audit event: auth.login</span>
        </CardFooter>
      </Card>
    </div>
  );
}
