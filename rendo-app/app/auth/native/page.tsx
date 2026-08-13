"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  consumeAuthCallbackUrl,
  nativeAppCallbackHref,
} from "@/lib/auth/native-oauth";

export default function NativeAuthHandoffPage() {
  const router = useRouter();
  const [appHref, setAppHref] = useState("rendo://auth/callback");
  const [message, setMessage] = useState("Finishing sign-in…");
  const [showOpen, setShowOpen] = useState(false);

  useEffect(() => {
    const deepLink = nativeAppCallbackHref();
    setAppHref(deepLink);

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
      setMessage("Signed in. Open RENDO to finish.");
      setShowOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-text-secondary">{message}</p>
      {showOpen ? (
        <a
          href={appHref}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-text-primary px-6 text-[15px] font-semibold text-bg-primary"
        >
          Open RENDO
        </a>
      ) : null}
    </div>
  );
}
