"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  listenForNativeAuthUrl,
  startNativeOAuth,
} from "@/lib/auth/native-oauth";

type AuthContextValue = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  accessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    let cancelled = false;
    const applySession = (next: Session | null) => {
      if (cancelled) return;
      setSession(next);
      setReady(true);
    };

    void client.auth.getSession().then(({ data }) => {
      applySession(data.session);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      queueMicrotask(() => applySession(next));
    });

    const stopNativeAuth = listenForNativeAuthUrl(client);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      stopNativeAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("Cloud backup is not configured.");
    await startNativeOAuth(client, "google", {
      prompt: "select_account",
    });
  }, []);

  const signInWithApple = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("Cloud backup is not configured.");
    await startNativeOAuth(client, "apple");
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      configured,
      session,
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      signInWithGoogle,
      signInWithApple,
      signOut,
    }),
    [
      ready,
      configured,
      session,
      signInWithGoogle,
      signInWithApple,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

