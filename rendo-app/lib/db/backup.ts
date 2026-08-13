"use client";

import { getDb } from "@/lib/db";
import {
  clearMutations,
  getPendingMutations,
  listRecipes,
  notifyVaultChanged,
  refreshTags,
  upsertRecipe,
} from "@/lib/db/queries";
import type { Recipe } from "@/lib/db/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { assembleRecipes } from "@/lib/db/cloud-recipe";

export type SyncResult = {
  ok: boolean;
  synced?: number;
  pulled?: number;
  skipped?: number | boolean;
  reason?: string;
  error?: string;
};

const RECIPE_CHUNK = 1;

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

  if (/load failed|failed to fetch|networkerror|network request failed|timed out|timeout/i.test(message)) {
    return "Backup timed out before the server responded. RENDO will retry one recipe at a time.";
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

function syncEndpoint() {
  if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
    return `${window.location.origin}/api/sync`;
  }
  return "/api/sync";
}

async function postSync(
  accessToken: string,
  body: unknown
): Promise<SyncResult & { applied?: string[]; recipes?: Recipe[] }> {
  let res: Response;
  try {
    res = await fetch(syncEndpoint(), {
      method: "POST",
      headers: await authHeaders(accessToken),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err) };
  }
  return readSyncResponse(res);
}

async function postSyncWithRetry(
  accessToken: string,
  body: unknown
): Promise<SyncResult & { applied?: string[]; recipes?: Recipe[] }> {
  let last: SyncResult & { applied?: string[]; recipes?: Recipe[] } = {
    ok: false,
    error: "Backup failed.",
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    last = await postSync(accessToken, body);
    if (last.ok) return last;
    const retryable = /timed out|timeout|reach the server|failed to fetch|network|502|503|504|500|invalid response/i.test(
      last.error ?? ""
    );
    if (!retryable) return last;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return last;
}

async function pullRecipesViaSupabase(): Promise<Recipe[] | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;

  const { data: rows, error } = await client
    .from("recipes")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const list = (rows ?? []) as Record<string, unknown>[];
  if (!list.length) return [];

  const ids = list.map((row) => String(row.id));
  const [ingredients, steps, tags, notes] = await Promise.all([
    client.from("recipe_ingredients").select("*").in("recipe_id", ids),
    client.from("recipe_steps").select("*").in("recipe_id", ids),
    client.from("recipe_tags").select("*").in("recipe_id", ids),
    client.from("kitchen_notes").select("*").in("recipe_id", ids),
  ]);
  for (const result of [ingredients, steps, tags, notes]) {
    if (result.error) throw result.error;
  }

  return assembleRecipes(
    list,
    (ingredients.data ?? []) as Record<string, unknown>[],
    (steps.data ?? []) as Record<string, unknown>[],
    (tags.data ?? []) as Record<string, unknown>[],
    (notes.data ?? []) as Record<string, unknown>[]
  );
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

  let synced = 0;
  for (const mutation of cleaned) {
    const data = await postSyncWithRetry(accessToken, { mutations: [mutation] });
    if (!data.ok) {
      return {
        ok: false,
        synced,
        error:
          data.error ??
          `Backup stopped after ${synced} change(s). Try Sync now to continue.`,
      };
    }
    if (Array.isArray(data.applied) && data.applied.length) {
      await clearMutations(data.applied);
    }
    synced += data.synced ?? 1;
  }

  return { ok: true, synced };
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
    const push = await postSyncWithRetry(accessToken, { recipes: chunk });
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

  let recipes: Recipe[] | undefined;
  let apiError: string | undefined;

  try {
    const res = await fetch(syncEndpoint(), {
      method: "GET",
      headers: await authHeaders(accessToken),
    });
    const data = await readSyncResponse(res);
    if (data.ok && Array.isArray(data.recipes) && data.recipes.length > 0) {
      recipes = data.recipes;
    } else if (!data.ok) {
      apiError = data.error ?? "Pull failed";
    }
  } catch (err) {
    apiError = friendlyNetworkError(err);
  }

  if (!recipes) {
    try {
      const direct = await pullRecipesViaSupabase();
      if (direct) recipes = direct;
    } catch (err) {
      if (apiError) {
        return { ok: false, error: apiError };
      }
      return { ok: false, error: friendlyNetworkError(err) };
    }
  }

  if (!recipes) {
    return { ok: false, error: apiError ?? "Pull failed" };
  }

  let pulled = 0;
  for (const remote of recipes) {
    const db = getDb();
    const local = await db.recipes.get(remote.id);
    if (!local || remote.updated_at >= local.updated_at) {
      // Keep local rating/cooked if cloud schema hasn't caught up yet.
      const merged: Recipe = {
        ...remote,
        rating: remote.rating ?? local?.rating ?? null,
        cooked: Boolean(remote.cooked || local?.cooked),
        times_cooked: Math.max(
          remote.times_cooked ?? 0,
          local?.times_cooked ?? 0
        ),
      };
      await upsertRecipe(merged, false);
      pulled += 1;
    }
  }
  await refreshTags();
  notifyVaultChanged();

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
