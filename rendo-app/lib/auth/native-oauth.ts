import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import type { Provider, SupabaseClient } from "@supabase/supabase-js";
import { isIncomingShareUrl } from "@/lib/native/incoming-share";

export const NATIVE_HTTPS_REDIRECT =
  "https://rendorecipes.netlify.app/auth/callback";
export const NATIVE_APP_CALLBACK = "rendo://auth/callback";

export function oauthRedirectTo() {
  if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
    return `${window.location.origin}/auth/callback`;
  }
  return NATIVE_HTTPS_REDIRECT;
}

export function nativeAppCallbackHref(fromUrl: string | URL = window.location.href) {
  const url = typeof fromUrl === "string" ? new URL(fromUrl) : fromUrl;
  return `${NATIVE_APP_CALLBACK}${url.search}${url.hash}`;
}

export async function startNativeOAuth(
  client: SupabaseClient,
  provider: Provider,
  queryParams?: Record<string, string>
) {
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthRedirectTo(),
      skipBrowserRedirect: false,
      queryParams,
    },
  });
  if (error) throw error;
}

export function listenForNativeAuthUrl(client: SupabaseClient) {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  const pending = CapApp.addListener("appUrlOpen", ({ url }) => {
    if (isIncomingShareUrl(url)) return;
    void (async () => {
      try {
        const signedIn = await consumeAuthCallbackUrl(client, url);
        if (signedIn && typeof window !== "undefined") {
          window.location.replace("/settings?auth=signed_in");
        }
      } catch {
        // Stay on current screen; user can retry sign-in.
      }
    })();
  });

  return () => {
    void pending.then((handle) => handle.remove());
  };
}

export async function consumeAuthCallbackUrl(
  client: SupabaseClient,
  rawUrl: string
) {
  const url = new URL(rawUrl);
  const hashParams = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
  );
  const oauthError =
    url.searchParams.get("error_description") ||
    url.searchParams.get("error") ||
    hashParams.get("error_description") ||
    hashParams.get("error");
  if (oauthError) {
    throw new Error(oauthError.replace(/\+/g, " "));
  }

  if (isIncomingShareUrl(rawUrl)) return false;

  const isAuthReturn =
    url.protocol === "rendo:" ||
    url.pathname.includes("/auth/native") ||
    url.pathname.includes("/auth/callback") ||
    url.host === "auth";
  const code = url.searchParams.get("code") || hashParams.get("code");
  if (!isAuthReturn && !code && !url.hash.includes("access_token")) {
    return false;
  }

  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error && !(await client.auth.getSession()).data.session) {
      throw error;
    }
    if (!data.session && !(await client.auth.getSession()).data.session) {
      throw new Error("Google sign-in completed but no session was created.");
    }
    return true;
  }

  for (let i = 0; i < 8; i += 1) {
    const { data } = await client.auth.getSession();
    if (data.session) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return Boolean((await client.auth.getSession()).data.session);
}
