"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
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

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = use_auth();
  const { pushToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);
    try {
      const tokenRes = await signIn({
        email: trimmedEmail,
        password,
      });

      pushToast({
        tone: "success",
        title: "Welcome back",
        description: `Signed in with ${tokenRes.role} access.`,
      });

      if (tokenRes.role === "superadmin") {
        router.push("/admin/super");
      } else {
        router.push("/chat");
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(
          "Unable to connect to the authentication service. Please check your connection."
        );
      }
    } finally {
      setIsSubmitting(false);
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
            Sign in to Veritas AI
          </CardTitle>
          <CardDescription>
            Enter your organization credentials to access your knowledge
            workspace.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Work Email
              </label>
              <Input
                type="email"
                required
                minLength={3}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Password
              </label>
              <Input
                type="password"
                required
                minLength={1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isSubmitting}
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
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Sign In to Workspace"}
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
