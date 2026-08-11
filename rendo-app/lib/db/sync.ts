"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearMutations,
  getPendingMutations,
} from "@/lib/db/queries";

export async function flushSyncQueue(userId?: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, skipped: true as const };
  }

  const mutations = await getPendingMutations();
  if (!mutations.length) {
    return { synced: 0, skipped: false as const };
  }

  const res = await fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "x-user-id": userId } : {}),
    },
    body: JSON.stringify({ mutations }),
  });

  const data = await res.json();
  if (data.ok && Array.isArray(data.applied) && data.applied.length) {
    await clearMutations(data.applied);
  }

  return data;
}

export function useSyncOnReconnect(userId?: string) {
  const [lastResult, setLastResult] = useState<unknown>(null);

  const flush = useCallback(async () => {
    try {
      const result = await flushSyncQueue(userId);
      setLastResult(result);
    } catch (err) {
      setLastResult({ ok: false, error: String(err) });
    }
  }, [userId]);

  useEffect(() => {
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
  }, [flush]);

  return { flush, lastResult };
}
