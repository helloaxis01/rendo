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
  clearCloudSyncUser,
} from "@/lib/db/sync-status";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  ensureVaultScopedToUser,
  resetVaultScopeCache,
} from "@/lib/db/vault-scope";

const AUTO_BACKUP_MIN_GAP_MS = 45_000;
const PERIODIC_BACKUP_MS = 5 * 60_000;
const DEBOUNCE_MS = 4_000;

let lastFullBackupAt = 0;
let inFlight: Promise<void> | null = null;
let didRestoreForUser: string | null = null;

/**
 * Automatic cloud sync while signed in (queue-first):
 * - local writes enqueue mutations optimistically (UI stays instant)
 * - online / debounced changes flush the queue sequentially
 * - mount / reconnect / manual also delta-pull by updated_at
 */
export function useAutoCloudBackup() {
  const { accessToken, ready, user } = useAuth();
  const status = useSyncExternalStore(
    subscribeCloudSyncStatus,
    getCloudSyncStatus,
    getServerCloudSyncStatus
  );

  useEffect(() => {
    if (user?.id) {
      hydrateCloudSyncStatusFromStorage(user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    lastFullBackupAt = 0;
    inFlight = null;
    didRestoreForUser = null;
    resetVaultScopeCache();
  }, [user?.id]);

  const userId = user?.id ?? null;

  const runBackup = useCallback(
    async (reason: "mount" | "change" | "online" | "periodic" | "manual") => {
      if (!accessToken || !userId) return;

      const scope = await ensureVaultScopedToUser(userId);
      if (scope === "account_switch") {
        didRestoreForUser = null;
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setCloudSyncStatus({
          state: "error",
          message: "Offline. We’ll sync when you’re back online.",
        });
        return;
      }

      const shouldPull =
        reason === "online" ||
        reason === "manual" ||
        reason === "periodic" ||
        (reason === "mount" && didRestoreForUser !== userId);

      // Local edits: flush the mutation queue only (no full vault push).
      const now = Date.now();
      if (
        reason === "change" &&
        now - lastFullBackupAt < AUTO_BACKUP_MIN_GAP_MS
      ) {
        try {
          setCloudSyncStatus({
            state: "syncing",
            message: "Syncing your latest changes…",
          });
          const flushed = await flushSyncQueue(accessToken);
          if (!flushed.ok) {
            setCloudSyncStatus({
              state: "error",
              message: flushed.error ?? "Couldn’t sync queued changes.",
            });
            return;
          }
          setCloudSyncStatus({
            state: "ok",
            lastOkAt: new Date().toISOString(),
            lastCount: flushed.synced ?? 0,
            message:
              (flushed.synced ?? 0) > 0
                ? `Synced ${flushed.synced} change(s) · ${formatSyncAgo(new Date().toISOString())}`
                : getCloudSyncStatus().message || "Up to date.",
          });
        } catch (err) {
          setCloudSyncStatus({
            state: "error",
            message:
              err instanceof Error ? err.message : "Couldn’t sync queued changes.",
          });
        }
        return;
      }

      if (inFlight) return inFlight;

      inFlight = (async () => {
        try {
          // Push local deletes / upserts before any pull so cloud cannot resurrect them.
          await flushSyncQueue(accessToken);

          let pulled = 0;
          if (shouldPull) {
            setCloudSyncStatus({
              state: "syncing",
              message:
                reason === "manual"
                  ? "Syncing with the cloud…"
                  : "Restoring updates…",
            });
            const restored = await restoreVaultFromCloud(accessToken, {
              full: reason === "manual" && !getCloudSyncStatus().lastOkAt,
            });
            if (!restored.ok) {
              setCloudSyncStatus({
                state: "error",
                message: restored.error ?? "Couldn’t restore from the cloud.",
              });
              return;
            }
            pulled = restored.pulled ?? 0;
            if (userId) didRestoreForUser = userId;
            // Flush any local-newer upserts enqueued during conflict resolution.
            await flushSyncQueue(accessToken);
          }

          setCloudSyncStatus({
            state: "syncing",
            message:
              reason === "manual" ? "Backing up…" : "Auto-backing up…",
          });
          const result = await backupVaultToCloud(accessToken, {
            forceFull: reason === "manual" && !getCloudSyncStatus().lastOkAt,
          });
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
                ? `Synced ${pulled} recipe update(s) from the cloud`
                : count > 0
                  ? `Synced ${count} change(s) · ${formatSyncAgo(new Date().toISOString())}`
                  : `Cloud vault is up to date · ${formatSyncAgo(new Date().toISOString())}`,
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
    [accessToken, userId]
  );

  useEffect(() => {
    if (!ready || !accessToken || !user) {
      if (ready && !user) {
        clearCloudSyncUser();
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
