"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      router.replace(
        `/settings?auth=error&auth_message=${encodeURIComponent(
          "Supabase is not configured in this environment."
        )}`
      );
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        const hashParams = new URLSearchParams(
          url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
        );

        const oauthError =
          params.get("error_description") ||
          params.get("error") ||
          hashParams.get("error_description") ||
          hashParams.get("error");
        if (oauthError) {
          throw new Error(oauthError.replace(/\+/g, " "));
        }

        const code = params.get("code");

        // Prefer explicit PKCE exchange when Google returns a code.
        if (code) {
          const { data, error } = await client.auth.exchangeCodeForSession(code);
          if (error) {
            // detectSessionInUrl may have already consumed the code successfully
            const { data: existing } = await client.auth.getSession();
            if (!existing.session) throw error;
          } else if (!data.session) {
            const { data: existing } = await client.auth.getSession();
            if (!existing.session) {
              throw new Error("Google sign-in completed but no session was created.");
            }
          }
        } else {
          // Implicit / hash / already-handled redirect: wait briefly for session
          for (let i = 0; i < 8; i += 1) {
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            if (data.session) break;
            await sleep(150);
          }
          const { data: final } = await client.auth.getSession();
          if (!final.session) {
            throw new Error(
              "No sign-in code returned. Check Supabase Redirect URLs include https://rendorecipes.netlify.app/auth/callback"
            );
          }
        }

        if (cancelled) return;
        setMessage("Signed in. Redirecting…");
        router.replace("/settings?auth=signed_in");
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Sign-in failed.";
        setMessage(message);
        router.replace(
          `/settings?auth=error&auth_message=${encodeURIComponent(message)}`
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-2 px-4 text-center text-sm text-text-secondary">
      <p>{message}</p>
    </div>
  );
}
