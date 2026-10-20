"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearStoredSession,
  loadStoredSession,
  login as apiLogin,
  logout as apiLogout,
  refreshToken as apiRefreshToken,
  type StoredAuthSession,
} from "@/lib/api";
import type { LoginRequest, RoleType, TokenResponse } from "@/types/api";

interface AuthContextValue {
  session: StoredAuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  canWriteDocuments: boolean; // admin or editor (backend/app/api/documents.py:33,124,142)
  isAdmin: boolean; // admin (backend/app/api/tenants.py:22,32,48,64,84 & health.py:44)
  signIn: (payload: LoginRequest) => Promise<TokenResponse>;
  signOut: () => Promise<void>;
  refresh_session: () => Promise<TokenResponse | null>;
  hasRole: (...roles: RoleType[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export async function refresh_session(): Promise<TokenResponse | null> {
  try {
    return await apiRefreshToken();
  } catch {
    clearStoredSession();
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredAuthSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const stored = loadStoredSession();
    setSession(stored);
    setIsLoading(false);

    const handleStorageUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<StoredAuthSession | null>;
      if (customEvent.detail !== undefined) {
        setSession(customEvent.detail);
      } else {
        setSession(loadStoredSession());
      }
    };

    window.addEventListener("rag-auth-updated", handleStorageUpdate);
    window.addEventListener("storage", handleStorageUpdate);
    return () => {
      window.removeEventListener("rag-auth-updated", handleStorageUpdate);
      window.removeEventListener("storage", handleStorageUpdate);
    };
  }, []);

  const signIn = useCallback(async (payload: LoginRequest) => {
    const tokenRes = await apiLogin(payload);
    setSession(loadStoredSession());
    return tokenRes;
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setSession(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    const refreshed = await refresh_session();
    setSession(loadStoredSession());
    return refreshed;
  }, []);

  const hasRole = useCallback(
    (...roles: RoleType[]) => {
      if (!session) return false;
      return roles.includes(session.role);
    },
    [session]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      isAuthenticated: Boolean(session?.access_token),
      canWriteDocuments:
        session?.role === "admin" || session?.role === "editor",
      isAdmin: session?.role === "admin",
      signIn,
      signOut,
      refresh_session: handleRefresh,
      hasRole,
    }),
    [session, isLoading, signIn, signOut, handleRefresh, hasRole]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function use_auth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("use_auth() must be used within an <AuthProvider>");
  }
  return ctx;
}
