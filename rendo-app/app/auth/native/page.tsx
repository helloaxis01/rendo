"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { consumeAuthCallbackUrl } from "@/lib/auth/native-oauth";

export default function NativeAuthHandoffPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setMessage("Cloud backup is not configured.");
      return;
    }

    let cancelled = false;

    void (async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await consumeAuthCallbackUrl(client, window.location.href);
          if (cancelled) return;
          router.replace("/settings?auth=signed_in");
        } catch (err) {
          if (cancelled) return;
          const text =
            err instanceof Error && err.message
              ? err.message
              : "Sign-in failed.";
          setMessage(text);
          router.replace(
            `/settings?auth=error&auth_message=${encodeURIComponent(text)}`
          );
        }
        return;
      }

      // Safari: do not navigate to rendo:// automatically — Safari treats that
      // as a failed webpage. A tap on the link opens the app instead.
      // Do not exchange the code here; PKCE lives in the Xcode WebView.
      if (cancelled) return;
      setMessage(
        "Signed in on the web. Return to the RENDO app and try Google again after rebuilding from Xcode."
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-text-secondary">{message}</p>
    </div>
  );
}
