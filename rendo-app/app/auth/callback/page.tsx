"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message] = useState("Finishing sign-in…");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      router.replace("/settings?auth=error");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    void (async () => {
      try {
        if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const { error } = await client.auth.getSession();
          if (error) throw error;
        }
        router.replace("/settings?auth=signed_in");
      } catch {
        router.replace("/settings?auth=error");
      }
    })();
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center px-4 text-sm text-text-secondary">
      {message}
    </div>
  );
}
