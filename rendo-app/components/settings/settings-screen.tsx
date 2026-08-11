"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Cloud,
  Download,
  Moon,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  backupVaultToCloud,
  downloadLocalBackup,
  importLocalBackupFile,
  restoreVaultFromCloud,
} from "@/lib/db/backup";
import {
  deleteRecipe,
  listRecipes,
  setPreferences,
} from "@/lib/db/queries";
import type { Recipe } from "@/lib/db/types";
import { cn } from "@/lib/utils";

function subscribeNever() {
  return () => {};
}

export function SettingsScreen() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const searchParams = useSearchParams();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const isDark = (resolvedTheme ?? theme) === "dark";
  const auth = useAuth();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const authFlag = searchParams.get("auth");
  const authStatus =
    authFlag === "signed_in"
      ? "Signed in. You can back up or restore your vault."
      : authFlag === "error"
        ? "Sign-in failed. Check Supabase Google/Apple provider settings."
        : null;
  const displayStatus = status ?? authStatus;

  async function refreshRecipes() {
    setRecipes(await listRecipes());
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listRecipes();
      if (!cancelled) setRecipes(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyTheme(next: "light" | "dark") {
    setTheme(next);
    try {
      await setPreferences({ theme: next });
    } catch {
      // Dexie unavailable during SSR edge cases
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteRecipe(id);
      setPendingDeleteId(null);
      await refreshRecipes();
    } finally {
      setBusyId(null);
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
      const result = await backupVaultToCloud(auth.accessToken);
      if (!result.ok) {
        setStatus(result.error ?? "Backup failed.");
        return;
      }
      setStatus(
        `Cloud backup complete — ${result.synced ?? 0} recipe update(s) saved.`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Backup failed.");
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
      await refreshRecipes();
      setStatus(
        `Restored ${result.pulled ?? 0} recipe(s) from your cloud vault.`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Restore failed.");
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
        await refreshRecipes();
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

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl bg-bg-primary">
      <header className="flex h-14 items-center gap-2 border-b border-border-hairline px-2">
        <Button type="button" variant="ghost" size="icon" asChild>
          <Link href="/" aria-label="Back">
            <ChevronLeft className="h-6 w-6" />
          </Link>
        </Button>
        <h1 className="font-display text-lg tracking-wide">SETTINGS</h1>
      </header>

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
              <div className="rounded-2xl border border-border-hairline bg-bg-surface p-4">
                <p className="text-sm font-medium">Signed in</p>
                <p className="text-sm text-text-secondary">
                  {accountLabel ?? auth.user.id}
                </p>
              </div>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-text-primary text-sm font-medium text-bg-primary disabled:opacity-50"
                disabled={backupBusy}
                onClick={() => void handleCloudBackup()}
              >
                <Cloud className="h-4 w-4" />
                Back up to cloud
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

          <div className="mt-4 grid grid-cols-2 gap-2">
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

          {displayStatus && (
            <p className="mt-3 text-sm text-text-secondary" role="status">
              {displayStatus}
            </p>
          )}
        </section>

        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Appearance
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void applyTheme("light")}
              className={cn(
                "flex min-h-20 flex-col items-start justify-between rounded-2xl border p-4 text-left transition-colors",
                !isDark
                  ? "border-text-primary bg-bg-surface"
                  : "border-border-hairline bg-bg-surface"
              )}
            >
              <Sun className="h-5 w-5" />
              <span className="font-medium">Light</span>
            </button>
            <button
              type="button"
              onClick={() => void applyTheme("dark")}
              className={cn(
                "flex min-h-20 flex-col items-start justify-between rounded-2xl border p-4 text-left transition-colors",
                isDark
                  ? "border-text-primary bg-bg-surface"
                  : "border-border-hairline bg-bg-surface"
              )}
            >
              <Moon className="h-5 w-5" />
              <span className="font-medium">Dark</span>
            </button>
          </div>

          <div className="mt-4 flex min-h-14 items-center justify-between border-b border-border-hairline py-3">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-text-secondary">
                High-contrast black / white inversion
              </p>
            </div>
            {mounted ? (
              <Switch
                checked={isDark}
                onCheckedChange={(v) => void applyTheme(v ? "dark" : "light")}
                aria-label="Toggle dark mode"
              />
            ) : (
              <div className="h-7 w-12 rounded-full border border-border-hairline" />
            )}
          </div>
        </section>

        <section>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Recipes
          </p>
          <p className="mb-3 text-sm text-text-secondary">
            Delete removes a recipe from your local vault.
          </p>

          {recipes.length === 0 ? (
            <p className="py-6 text-sm text-text-secondary">No recipes yet.</p>
          ) : (
            <ul className="divide-y divide-border-hairline border-t border-border-hairline">
              {recipes.map((recipe) => {
                const confirming = pendingDeleteId === recipe.id;
                return (
                  <li key={recipe.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{recipe.title}</p>
                        <p className="text-xs text-text-secondary">
                          {recipe.prep_time_minutes} Mins
                          {recipe.source_handle
                            ? ` · ${recipe.source_handle}`
                            : ""}
                        </p>
                      </div>
                      {!confirming ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-hairline px-3 text-sm text-text-secondary hover:text-accent-alert"
                          onClick={() => setPendingDeleteId(recipe.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            className="h-9 rounded-full px-3 text-sm text-text-secondary"
                            disabled={busyId === recipe.id}
                            onClick={() => setPendingDeleteId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 items-center rounded-full bg-accent-alert px-3 text-sm font-medium text-white disabled:opacity-50"
                            disabled={busyId === recipe.id}
                            onClick={() => void handleDelete(recipe.id)}
                          >
                            {busyId === recipe.id ? "Deleting…" : "Confirm"}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
