"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSyncQueue, type SyncResult } from "@/lib/db/backup";
import { useAuth } from "@/lib/auth/auth-provider";

export function useSyncOnReconnect() {
  const { accessToken, ready } = useAuth();
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const flush = useCallback(async () => {
    if (!accessToken) return;
    try {
      const result = await flushSyncQueue(accessToken);
      setLastResult(result);
    } catch (err) {
      setLastResult({ ok: false, error: String(err) });
    }
  }, [accessToken]);

  useEffect(() => {
    if (!ready || !accessToken) return;

    const onOnline = () => {
      void flush();
    };
    window.addEventListener("online", onOnline);
    const timer = window.setTimeout(() => {
      void flush();
    }, 0);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearTimeout(timer);
    };
  }, [flush, ready, accessToken]);

  return { flush, lastResult };
}
