"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { fetchCurrentUser, type AuthState } from "@/lib/api";

type AuthContextValue = {
  auth: AuthState | null;
  isLoading: boolean;
  refreshAuth: () => Promise<AuthState | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      const current = await fetchCurrentUser();
      setAuth(current);
      return current;
    } catch {
      setAuth(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    fetchCurrentUser()
      .then((current) => {
        if (!isCancelled) setAuth(current);
      })
      .catch(() => {
        if (!isCancelled) setAuth(null);
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ auth, isLoading, refreshAuth }),
    [auth, isLoading, refreshAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth doit etre utilise dans AuthProvider.");
  }
  return value;
}
