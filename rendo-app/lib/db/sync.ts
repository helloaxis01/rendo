"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  backupVaultToCloud,
  flushSyncQueue,
  restoreVaultFromCloud,
} from "@/lib/db/backup";
import {
  formatSyncAgo,
  getCloudSyncStatus,
  getServerCloudSyncStatus,
  hydrateCloudSyncStatusFromStorage,
  setCloudSyncStatus,
  subscribeCloudSyncStatus,
} from "@/lib/db/sync-status";
import { useAuth } from "@/lib/auth/auth-provider";

const AUTO_BACKUP_MIN_GAP_MS = 45_000;
const PERIODIC_BACKUP_MS = 5 * 60_000;
const DEBOUNCE_MS = 4_000;

let lastFullBackupAt = 0;
let inFlight: Promise<void> | null = null;

/**
 * Automatic cloud backup while signed in:
 * - full vault backup on sign-in / reconnect
 * - debounced backup after local recipe changes
 * - periodic backup every 5 minutes
 * Surfaces status via sync-status store (library bar + Settings).
 */
export function useAutoCloudBackup() {
  const { accessToken, ready, user } = useAuth();
  const status = useSyncExternalStore(
    subscribeCloudSyncStatus,
    getCloudSyncStatus,
    getServerCloudSyncStatus
  );

  useEffect(() => {
    hydrateCloudSyncStatusFromStorage();
  }, []);

  const runBackup = useCallback(
    async (reason: "mount" | "change" | "online" | "periodic" | "manual") => {
      if (!accessToken) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setCloudSyncStatus({
          state: "error",
          message: "Offline — will sync when you’re back online.",
        });
        return;
      }

      const shouldPull =
        reason === "mount" || reason === "online" || reason === "manual";

      const now = Date.now();
      if (
        reason !== "manual" &&
        reason !== "mount" &&
        now - lastFullBackupAt < AUTO_BACKUP_MIN_GAP_MS
      ) {
        try {
          await flushSyncQueue(accessToken);
        } catch {
          // ignore; full backup will retry
        }
        return;
      }

      if (inFlight) return inFlight;

      inFlight = (async () => {
        try {
          let pulled = 0;
          if (shouldPull) {
            setCloudSyncStatus({
              state: "syncing",
              message: "Restoring your recipes…",
            });
            const restored = await restoreVaultFromCloud(accessToken);
            if (!restored.ok) {
              setCloudSyncStatus({
                state: "error",
                message: restored.error ?? "Couldn’t restore from the cloud.",
              });
              return;
            }
            pulled = restored.pulled ?? 0;
          }

          setCloudSyncStatus({
            state: "syncing",
            message:
              reason === "manual" ? "Backing up…" : "Auto-backing up…",
          });
          const result = await backupVaultToCloud(accessToken);
          if (!result.ok) {
            setCloudSyncStatus({
              state: "error",
              message: result.error ?? "Cloud backup failed.",
            });
            return;
          }
          lastFullBackupAt = Date.now();
          const count = result.synced ?? 0;
          setCloudSyncStatus({
            state: "ok",
            lastOkAt: new Date().toISOString(),
            lastCount: Math.max(count, pulled),
            message:
              pulled > 0
                ? `Synced ${pulled} recipe(s) from the cloud`
                : count > 0
                  ? `Backed up ${count} recipe update(s) · ${formatSyncAgo(new Date().toISOString())}`
                  : `No recipes in the cloud yet — open the web app signed in, then sync again.`,
          });
        } catch (err) {
          setCloudSyncStatus({
            state: "error",
            message:
              err instanceof Error ? err.message : "Cloud backup failed.",
          });
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    },
    [accessToken]
  );

  useEffect(() => {
    lastFullBackupAt = 0;
    inFlight = null;
  }, [user?.id]);

  useEffect(() => {
    if (!ready || !accessToken || !user) {
      if (ready && !user) {
        setCloudSyncStatus({
          state: "idle",
          message: "Sign in to enable automatic cloud backup.",
        });
      }
      return;
    }

    void runBackup("mount");

    let debounceTimer: number | null = null;
    const onVaultChanged = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void runBackup("change");
      }, DEBOUNCE_MS);
    };
    const onOnline = () => {
      void runBackup("online");
    };

    window.addEventListener("rendo:vault-changed", onVaultChanged);
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(() => {
      void runBackup("periodic");
    }, PERIODIC_BACKUP_MS);

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.removeEventListener("rendo:vault-changed", onVaultChanged);
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, [ready, accessToken, user, runBackup]);

  return {
    status,
    backupNow: () => runBackup("manual"),
  };
}

/** @deprecated Prefer useAutoCloudBackup — kept for call sites that only needed queue flush. */
export function useSyncOnReconnect() {
  return useAutoCloudBackup();
}
