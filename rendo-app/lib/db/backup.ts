"use client";

import { getDb } from "@/lib/db";
import {
  clearMutations,
  getPendingMutations,
  listRecipes,
  refreshTags,
  upsertRecipe,
} from "@/lib/db/queries";
import type { Recipe } from "@/lib/db/types";

export type SyncResult = {
  ok: boolean;
  synced?: number;
  pulled?: number;
  skipped?: number | boolean;
  reason?: string;
  error?: string;
};

async function authHeaders(accessToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function flushSyncQueue(accessToken?: string | null): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: true, synced: 0, skipped: true };
  }

  if (!accessToken) {
    return {
      ok: false,
      synced: 0,
      error: "Sign in to sync your vault to the cloud.",
    };
  }

  const mutations = await getPendingMutations();
  if (!mutations.length) {
    return { ok: true, synced: 0 };
  }

  const res = await fetch("/api/sync", {
    method: "POST",
    headers: await authHeaders(accessToken),
    body: JSON.stringify({ mutations }),
  });

  const data = (await res.json()) as SyncResult & { applied?: string[] };
  if (data.ok && Array.isArray(data.applied) && data.applied.length) {
    await clearMutations(data.applied);
  }

  return data;
}

/** Full vault backup: push every local recipe, then flush pending mutations. */
export async function backupVaultToCloud(
  accessToken: string
): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You are offline." };
  }

  const recipes = await listRecipes();
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: await authHeaders(accessToken),
    body: JSON.stringify({ recipes }),
  });
  const push = (await res.json()) as SyncResult;
  if (!push.ok) return push;

  const flush = await flushSyncQueue(accessToken);
  return {
    ok: flush.ok !== false,
    synced: (push.synced ?? recipes.length) + (flush.synced ?? 0),
    reason: flush.reason,
    error: flush.error,
  };
}

/** Pull cloud recipes and merge into Dexie (newer updated_at wins). */
export async function restoreVaultFromCloud(
  accessToken: string
): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You are offline." };
  }

  const res = await fetch("/api/sync", {
    method: "GET",
    headers: await authHeaders(accessToken),
  });
  const data = (await res.json()) as SyncResult & { recipes?: Recipe[] };
  if (!data.ok || !data.recipes) {
    return { ok: false, error: data.error ?? "Pull failed" };
  }

  let pulled = 0;
  for (const remote of data.recipes) {
    const db = getDb();
    const local = await db.recipes.get(remote.id);
    if (!local || remote.updated_at >= local.updated_at) {
      await upsertRecipe(remote, false);
      pulled += 1;
    }
  }
  await refreshTags();

  return { ok: true, pulled, synced: pulled };
}

export function downloadLocalBackup(recipes: Recipe[]) {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    recipes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rendo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importLocalBackupFile(file: File): Promise<number> {
  const text = await file.text();
  const parsed = JSON.parse(text) as { recipes?: Recipe[] };
  const recipes = parsed.recipes ?? [];
  for (const recipe of recipes) {
    await upsertRecipe(
      {
        ...recipe,
        updated_at: recipe.updated_at ?? new Date().toISOString(),
        created_at: recipe.created_at ?? new Date().toISOString(),
      },
      true
    );
  }
  await refreshTags();
  return recipes.length;
}
