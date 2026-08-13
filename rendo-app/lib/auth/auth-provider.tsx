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
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

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
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: oauthRedirectTo(),
        skipBrowserRedirect: false,
        queryParams: {
          // Force account picker so stale Google sessions don't silently fail
          prompt: "select_account",
        },
      },
    });
    if (error) throw error;
  }, []);

  const signInWithApple = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("Cloud backup is not configured.");
    const { error } = await client.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: oauthRedirectTo(),
        skipBrowserRedirect: false,
      },
    });
    if (error) throw error;
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

function oauthRedirectTo() {
  if (Capacitor.isNativePlatform()) {
    return "rendo://auth/callback";
  }
  return `${window.location.origin}/auth/callback`;
}

function listenForNativeAuthUrl(
  client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>
) {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  const pending = CapApp.addListener("appUrlOpen", ({ url }) => {
    void consumeAuthCallbackUrl(client, url).catch(() => {
      // Stay on current screen; user can retry sign-in.
    });
  });

  return () => {
    void pending.then((handle) => handle.remove());
  };
}

async function consumeAuthCallbackUrl(
  client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  rawUrl: string
) {
  const url = new URL(rawUrl);
  if (!url.pathname.includes("auth/callback") && url.host !== "auth") {
    if (!url.searchParams.get("code") && !url.hash.includes("access_token")) {
      return;
    }
  }
  const code = url.searchParams.get("code");
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error && !(await client.auth.getSession()).data.session) {
      throw error;
    }
    if (!data.session && !(await client.auth.getSession()).data.session) {
      throw new Error("Google sign-in completed but no session was created.");
    }
    return;
  }
  for (let i = 0; i < 8; i += 1) {
    const { data } = await client.auth.getSession();
    if (data.session) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}
