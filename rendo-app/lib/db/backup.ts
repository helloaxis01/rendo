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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SyncResult = {
  ok: boolean;
  synced?: number;
  pulled?: number;
  skipped?: number | boolean;
  reason?: string;
  error?: string;
};

const RECIPE_CHUNK = 4;

async function authHeaders(accessToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

function friendlyNetworkError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Backup failed.";

  if (/load failed|failed to fetch|networkerror|network request failed/i.test(message)) {
    return "Backup request failed to reach the server (often a payload that’s too large, or a brief network drop). Try again — RENDO now uploads recipes in smaller batches.";
  }
  return message;
}

async function readSyncResponse(
  res: Response
): Promise<SyncResult & { applied?: string[]; recipes?: Recipe[] }> {
  const text = await res.text();
  let data: SyncResult & { applied?: string[]; recipes?: Recipe[] };
  try {
    data = JSON.parse(text) as SyncResult & {
      applied?: string[];
      recipes?: Recipe[];
    };
  } catch {
    return {
      ok: false,
      error:
        res.status >= 500
          ? `Cloud sync failed (${res.status}). Check Netlify Supabase env keys.`
          : "Cloud sync returned an invalid response.",
    };
  }
  if (!res.ok) {
    return {
      ...data,
      ok: false,
      error: friendlySyncError(
        data.error ?? `Cloud sync failed (${res.status}).`
      ),
    };
  }
  return {
    ...data,
    error: data.error ? friendlySyncError(data.error) : data.error,
  };
}

function friendlySyncError(message: string): string {
  if (/user_cover_image_url|schema cache|column/i.test(message)) {
    return `${message} — In Supabase SQL Editor, run rendo-app/supabase/FIX_CLOUD_BACKUP.sql, then try again.`;
  }
  if (/unauthorized|sign in|jwt|session/i.test(message)) {
    return `${message} — Sign out and sign in with Google again.`;
  }
  if (/row-level security|rls|permission denied/i.test(message)) {
    return `${message} — Check Supabase RLS policies for recipes, or set SUPABASE_SERVICE_ROLE_KEY on Netlify.`;
  }
  return message;
}

/** Never send multi-MB data URLs in the sync JSON body. */
function stripInlineDataUrls(recipe: Recipe): Recipe {
  const scrub = (value: string | null | undefined) =>
    value?.startsWith("data:") ? null : (value ?? null);

  return {
    ...recipe,
    cover_image_url: scrub(recipe.cover_image_url),
    user_cover_image_url: scrub(recipe.user_cover_image_url),
  };
}

/** Upload local data-URL covers so sync payloads stay small. */
async function withRemoteUserCovers(
  recipes: Recipe[],
  userId: string
): Promise<Recipe[]> {
  const client = getSupabaseBrowserClient();
  if (!client) return recipes.map(stripInlineDataUrls);

  const next: Recipe[] = [];
  for (const recipe of recipes) {
    const raw = recipe.user_cover_image_url;
    if (!raw?.startsWith("data:image/")) {
      next.push(stripInlineDataUrls(recipe));
      continue;
    }

    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      next.push({ ...recipe, user_cover_image_url: null });
      continue;
    }

    try {
      const contentType = match[1];
      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const path = `${userId}/${recipe.id}.${ext}`;
      const { error } = await client.storage
        .from("recipe-media")
        .upload(path, bytes, { contentType, upsert: true });
      if (error) {
        next.push(stripInlineDataUrls({ ...recipe, user_cover_image_url: null }));
        continue;
      }
      const { data } = client.storage.from("recipe-media").getPublicUrl(path);
      next.push(
        stripInlineDataUrls({ ...recipe, user_cover_image_url: data.publicUrl })
      );
    } catch {
      next.push(stripInlineDataUrls({ ...recipe, user_cover_image_url: null }));
    }
  }
  return next;
}

async function postSync(
  accessToken: string,
  body: unknown
): Promise<SyncResult & { applied?: string[]; recipes?: Recipe[] }> {
  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: await authHeaders(accessToken),
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err) };
  }
  return readSyncResponse(res);
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

  // Strip huge inline images from mutation payloads too
  const cleaned = mutations.map((mutation) => {
    if (
      mutation.entity === "recipe" &&
      mutation.operation === "upsert" &&
      mutation.payload &&
      typeof mutation.payload === "object"
    ) {
      return {
        ...mutation,
        payload: stripInlineDataUrls(mutation.payload as Recipe),
      };
    }
    return mutation;
  });

  const data = await postSync(accessToken, { mutations: cleaned });
  if (data.ok && Array.isArray(data.applied) && data.applied.length) {
    await clearMutations(data.applied);
  }

  return data;
}

/** Full vault backup: push every local recipe in chunks, then flush pending mutations. */
export async function backupVaultToCloud(
  accessToken: string
): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You are offline." };
  }

  const client = getSupabaseBrowserClient();
  const {
    data: { user },
  } = client ? await client.auth.getUser() : { data: { user: null } };

  const recipes = await listRecipes();
  const prepared = user
    ? await withRemoteUserCovers(recipes, user.id)
    : recipes.map(stripInlineDataUrls);

  let synced = 0;
  for (let i = 0; i < prepared.length; i += RECIPE_CHUNK) {
    const chunk = prepared.slice(i, i + RECIPE_CHUNK);
    const push = await postSync(accessToken, { recipes: chunk });
    if (!push.ok) {
      return {
        ok: false,
        synced,
        error:
          push.error ??
          `Backup stopped after ${synced} recipe(s). Try again to continue.`,
      };
    }
    synced += push.synced ?? chunk.length;
  }

  const flush = await flushSyncQueue(accessToken);
  return {
    ok: flush.ok !== false,
    synced: synced + (flush.synced ?? 0),
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

  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "GET",
      headers: await authHeaders(accessToken),
    });
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err) };
  }

  const data = await readSyncResponse(res);
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
