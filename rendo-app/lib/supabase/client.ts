import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  if (!browserClient) {
    browserClient = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}

function looksLikeJwt(value: string | undefined): boolean {
  return Boolean(value && value.startsWith("eyJ"));
}

/** Service-role client when the key is valid; otherwise null. */
export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !looksLikeJwt(key)) return null;
  return createClient(url, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Prefer service role for server writes; fall back to the caller's JWT so RLS
 * still works when the service key is missing/misconfigured.
 */
export function getSupabaseServerClient(accessToken?: string | null) {
  const service = getSupabaseServiceClient();
  if (service) return service;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  if (accessToken) {
    return createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
