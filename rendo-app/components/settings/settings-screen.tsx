"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Cloud,
  Download,
  Moon,
  Power,
  Sun,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  downloadLocalBackup,
  importLocalBackupFile,
  restoreVaultFromCloud,
} from "@/lib/db/backup";
import { useAutoCloudBackup } from "@/lib/db/sync";
import {
  formatSyncAgo,
  getCloudSyncStatus,
  getServerCloudSyncStatus,
  hydrateCloudSyncStatusFromStorage,
  subscribeCloudSyncStatus,
} from "@/lib/db/sync-status";
import { getPreferences, listRecipes, setPreferences } from "@/lib/db/queries";
import { CloudSyncBar } from "@/components/library/cloud-sync-bar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function friendlyBackupCatch(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Backup failed.";
  if (/load failed|failed to fetch|networkerror|network request failed/i.test(message)) {
    return "Couldn’t reach the sync server. Check your connection and try again. If it keeps failing, confirm Supabase keys are set on Netlify.";
  }
  return message;
}

export function SettingsScreen() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isDark = (resolvedTheme ?? theme) === "dark";
  const auth = useAuth();

  const [backupBusy, setBackupBusy] = useState(false);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const { status: autoStatus, backupNow } = useAutoCloudBackup();
  const [syncSnap, setSyncSnap] = useState(getServerCloudSyncStatus);

  useEffect(() => {
    hydrateCloudSyncStatusFromStorage();
    setSyncSnap(getCloudSyncStatus());
    return subscribeCloudSyncStatus(() => setSyncSnap(getCloudSyncStatus()));
  }, []);

  useEffect(() => {
    void getPreferences().then((prefs) => {
      setKeepScreenAwake(prefs.keep_screen_awake ?? true);
    });
  }, []);

  useEffect(() => {
    if (!auth.ready) return;

    const authFlag = searchParams.get("auth");
    const authMessage = searchParams.get("auth_message");
    if (!authFlag) return;

    if (authFlag === "signed_in" || (authFlag === "error" && auth.user)) {
      setStatus("Signed in. Restoring your recipes…");
      void backupNow();
    } else if (authFlag === "error") {
      setStatus(
        authMessage
          ? decodeURIComponent(authMessage)
          : "Sign-in failed. Try Continue with Google again."
      );
    }

    // Clear query params so refreshing doesn't re-show stale auth banners
    router.replace(pathname);
  }, [searchParams, auth.user, auth.ready, router, pathname, backupNow]);

  const displayStatus =
    status ??
    (auth.user
      ? autoStatus.state === "syncing"
        ? autoStatus.message
        : autoStatus.state === "error"
          ? autoStatus.message
          : syncSnap.lastOkAt
            ? `Automatic backup · last synced ${formatSyncAgo(syncSnap.lastOkAt)}`
            : "Automatic cloud backup is on."
      : null);

  async function applyTheme(next: "light" | "dark") {
    setTheme(next);
    try {
      await setPreferences({ theme: next });
    } catch {
      // Dexie unavailable during SSR edge cases
    }
  }

  async function handleCloudBackup() {
    if (!auth.accessToken) {
      setStatus("Sign in first to sync to the cloud.");
      return;
    }
    setBackupBusy(true);
    setStatus("Backing up…");
    try {
      await backupNow();
      const snap = getCloudSyncStatus();
      if (snap.state === "error") {
        setStatus(snap.message);
        return;
      }
      setStatus(
        snap.message ||
          (snap.lastCount && snap.lastCount > 0
            ? `Synced ${snap.lastCount} recipe(s) with the cloud.`
            : "Cloud vault is up to date.")
      );
    } catch (err) {
      setStatus(friendlyBackupCatch(err));
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleCloudRestore() {
    if (!auth.accessToken) {
      setStatus("Sign in first to restore from the cloud.");
      return;
    }
    setBackupBusy(true);
    setStatus("Restoring…");
    try {
      const result = await restoreVaultFromCloud(auth.accessToken);
      if (!result.ok) {
        setStatus(result.error ?? "Restore failed.");
        return;
      }
      setStatus(
        `Restored ${result.pulled ?? 0} recipe(s) from your cloud vault.`
      );
    } catch (err) {
      setStatus(friendlyBackupCatch(err));
    } finally {
      setBackupBusy(false);
    }
  }

  function handleDownloadBackup() {
    void listRecipes().then((list) => {
      downloadLocalBackup(list);
      setStatus(`Downloaded backup of ${list.length} recipe(s).`);
    });
  }

  function handleImportBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const count = await importLocalBackupFile(file);
        setStatus(`Imported ${count} recipe(s) from backup file.`);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Import failed.");
      }
    };
    input.click();
  }

  const accountLabel =
    auth.user?.email ??
    auth.user?.user_metadata?.full_name ??
    auth.user?.user_metadata?.name ??
    null;
  const authProvider =
    auth.user?.app_metadata?.provider ??
    auth.user?.identities?.[0]?.provider ??
    null;
  const signedInLabel = authProvider
    ? `Signed in with ${String(authProvider).replace(/^./, (c) => c.toUpperCase())}`
    : "Signed in";

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary">
      <header className="border-b border-border-hairline bg-bg-primary pt-[max(env(safe-area-inset-top,0px),var(--rendo-clock-bar,0px))]">
        <div className="flex h-14 items-center gap-2 px-2">
          <Button type="button" variant="ghost" size="icon" asChild>
            <Link href="/" aria-label="Back">
              <ChevronLeft className="h-6 w-6" />
            </Link>
          </Button>
          <h1 className="font-display text-lg tracking-wide">SETTINGS</h1>
        </div>
      </header>
      <CloudSyncBar />

      <div className="space-y-8 px-4 py-6">
        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Backup & Sync
          </p>

          {!auth.configured ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Sign in to back up your vault to the cloud and restore it on
                another device.
              </p>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center rounded-full bg-text-primary text-sm font-medium text-bg-primary opacity-50"
                disabled
              >
                Continue with Google
              </button>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center rounded-full border border-border-hairline bg-bg-surface text-sm font-medium opacity-50"
                disabled
              >
                Continue with Apple
              </button>
              <p className="rounded-2xl border border-border-hairline bg-bg-surface p-4 text-sm text-text-secondary">
                Cloud sync is waiting on Netlify env vars (
                <code className="text-text-primary">NEXT_PUBLIC_SUPABASE_URL</code>
                ,{" "}
                <code className="text-text-primary">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>
                ). Local Download / Import still works below.
              </p>
            </div>
          ) : !auth.user ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Sign in to back up your vault to the cloud and restore it on
                another device.
              </p>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center rounded-full bg-text-primary text-sm font-medium text-bg-primary disabled:opacity-50"
                disabled={!auth.ready || backupBusy}
                onClick={() =>
                  void auth.signInWithGoogle().catch((err: Error) =>
                    setStatus(err.message)
                  )
                }
              >
                Continue with Google
              </button>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center rounded-full border border-border-hairline bg-bg-surface text-sm font-medium disabled:opacity-50"
                disabled={!auth.ready || backupBusy}
                onClick={() =>
                  void auth.signInWithApple().catch((err: Error) =>
                    setStatus(err.message)
                  )
                }
              >
                Continue with Apple
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Web and the iOS app share the same cloud vault. Sync pulls
                recipes down, then backs up anything new.
              </p>
              <div className="rounded-2xl border border-border-hairline bg-bg-surface p-4">
                <p className="text-sm font-medium">{signedInLabel}</p>
                <p className="text-sm text-text-secondary">
                  {accountLabel ?? auth.user.id}
                </p>
              </div>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-text-primary text-sm font-medium text-bg-primary disabled:opacity-50"
                disabled={backupBusy || autoStatus.state === "syncing"}
                onClick={() => void handleCloudBackup()}
              >
                <Cloud className="h-4 w-4" />
                Sync now
              </button>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border-hairline bg-bg-surface text-sm font-medium disabled:opacity-50"
                disabled={backupBusy}
                onClick={() => void handleCloudRestore()}
              >
                <Upload className="h-4 w-4" />
                Restore from cloud
              </button>
              {displayStatus && (
                <p
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm",
                    /fail|error|required|offline|invalid|check/i.test(
                      displayStatus
                    )
                      ? "border-accent-alert/40 bg-accent-alert/5 text-accent-alert"
                      : "border-border-hairline bg-bg-surface text-text-secondary"
                  )}
                  role="status"
                >
                  {displayStatus}
                </p>
              )}
              <button
                type="button"
                className="flex h-11 w-full items-center justify-center rounded-full text-sm text-text-secondary"
                disabled={backupBusy}
                onClick={() =>
                  void auth.signOut().then(() => setStatus("Signed out."))
                }
              >
                Sign out
              </button>
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
              Local file
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border-hairline bg-bg-surface text-sm font-medium"
                onClick={handleDownloadBackup}
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border-hairline bg-bg-surface text-sm font-medium"
                onClick={handleImportBackup}
              >
                <Upload className="h-4 w-4" />
                Import file
              </button>
            </div>
          </div>

          {!auth.user && displayStatus && (
            <p
              className={cn(
                "mt-3 rounded-2xl border px-4 py-3 text-sm",
                /fail|error|required|offline|invalid|check/i.test(displayStatus)
                  ? "border-accent-alert/40 bg-accent-alert/5 text-accent-alert"
                  : "border-border-hairline bg-bg-surface text-text-secondary"
              )}
              role="status"
            >
              {displayStatus}
            </p>
          )}
        </section>

        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Cooking
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Power className="h-4 w-4" strokeWidth={2.25} />
                Screen Always Awake
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Default for cooking mode. You can override it for a single session.
              </p>
            </div>
            <Switch
              checked={keepScreenAwake}
              onCheckedChange={(value) => {
                setKeepScreenAwake(value);
                void setPreferences({ keep_screen_awake: value });
              }}
              aria-label="Screen always awake"
            />
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Appearance
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Theme</p>
            <div
              className="inline-flex h-9 items-center rounded-full bg-bg-muted p-0.5"
              role="group"
              aria-label="Theme"
            >
              <button
                type="button"
                aria-pressed={!isDark}
                onClick={() => void applyTheme("light")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
                  !isDark
                    ? "bg-text-primary text-bg-primary"
                    : "text-text-secondary"
                )}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                type="button"
                aria-pressed={isDark}
                onClick={() => void applyTheme("dark")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
                  isDark
                    ? "bg-text-primary text-bg-primary"
                    : "text-text-secondary"
                )}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
