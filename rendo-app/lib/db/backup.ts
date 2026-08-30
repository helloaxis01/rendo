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
import { assembleRecipes } from "@/lib/db/cloud-recipe";
import { withDerivedCooked } from "@/lib/db/cook-events";
import { withRemoteMemoryPhotos } from "@/lib/db/memory-photos";
import { resolveRecipePullConflict } from "@/lib/db/sync-merge";
import { getPendingDeletedRecipeIds } from "@/lib/db/deleted";
import { getCloudSyncStatus } from "@/lib/db/sync-status";
import {
  mutationIsSeedRecipe,
  recipesForCloudPush,
} from "@/lib/db/vault-scope";

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
    return `${message} In Supabase SQL Editor, run rendo-app/supabase/FIX_CLOUD_BACKUP.sql, then try again.`;
  }
  if (/unauthorized|sign in|jwt|session/i.test(message)) {
    return `${message} Sign out and sign in with Google again.`;
  }
  if (/row-level security|rls|permission denied/i.test(message)) {
    return `${message} Check Supabase RLS policies for recipes, or set SUPABASE_SERVICE_ROLE_KEY on Netlify.`;
  }
  return message;
}

/** Never send multi-MB data URLs in the sync JSON body unless the server must upload them. */
function stripCoverDataUrls(
  recipe: Recipe,
  options?: { keepUserCoverDataUrl?: boolean }
): Recipe {
  const scrub = (value: string | null | undefined) =>
    value?.startsWith("data:") ? null : (value ?? null);

  const userCover =
    options?.keepUserCoverDataUrl &&
    recipe.user_cover_image_url?.startsWith("data:image/")
      ? recipe.user_cover_image_url
      : scrub(recipe.user_cover_image_url);

  return {
    ...recipe,
    cover_image_url: scrub(recipe.cover_image_url),
    user_cover_image_url: userCover,
  };
}

function stripInlineDataUrls(recipe: Recipe): Recipe {
  const keepUserCoverDataUrl = recipe.user_cover_image_url?.startsWith("data:image/");
  const scrubbed = stripCoverDataUrls(recipe, { keepUserCoverDataUrl });
  return {
    ...scrubbed,
    cook_events: (scrubbed.cook_events ?? []).map((event) => ({
      ...event,
      photo_urls: (event.photo_urls ?? []).filter(
        (url) => Boolean(url) && !url.startsWith("data:")
      ),
    })),
  };
}

/** Upload local data-URL covers + memory photos so sync payloads stay small. */
async function prepareRecipesForRemotePush(
  recipes: Recipe[],
  userId: string
): Promise<Recipe[]> {
  const withCovers = await withRemoteUserCovers(recipes, userId);
  const withMemories = await withRemoteMemoryPhotos(withCovers, userId);
  return withMemories.map(stripInlineDataUrls);
}

/** Upload local data-URL covers so sync payloads stay small. */
async function withRemoteUserCovers(
  recipes: Recipe[],
  userId: string
): Promise<Recipe[]> {
  const client = getSupabaseBrowserClient();
  if (!client) return recipes;

  const next: Recipe[] = [];
  for (const recipe of recipes) {
    const raw = recipe.user_cover_image_url;
    if (!raw?.startsWith("data:image/")) {
      next.push(stripCoverDataUrls(recipe));
      continue;
    }

    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      next.push(recipe);
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
        // Keep the data URL so the sync API can attempt a server-side upload.
        next.push(recipe);
        continue;
      }
      const { data } = client.storage.from("recipe-media").getPublicUrl(path);
      const updated = stripCoverDataUrls({
        ...recipe,
        user_cover_image_url: data.publicUrl,
      });
      next.push(updated);
      await upsertRecipe(updated, false);
    } catch {
      next.push(recipe);
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

async function pullRecipesViaSupabase(
  since?: string | null
): Promise<Recipe[] | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;

  let query = client
    .from("recipes")
    .select("*")
    .order("updated_at", { ascending: false });
  if (since) {
    query = query.gt("updated_at", since);
  }

  const { data: rows, error } = await query;
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

/** Skew so borderline updated_at rows are not missed on delta pull. */
function deltaSinceCursor(lastOkAt: string | null): string | null {
  if (!lastOkAt) return null;
  const at = Date.parse(lastOkAt);
  if (!Number.isFinite(at)) return null;
  return new Date(at - 60_000).toISOString();
}

async function pushRecipes(
  accessToken: string,
  recipes: Recipe[],
  userId: string | undefined
): Promise<SyncResult> {
  if (!recipes.length) return { ok: true, synced: 0 };

  const prepared = userId
    ? await prepareRecipesForRemotePush(recipes, userId)
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
  return { ok: true, synced };
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
  const seedIds = mutations.filter(mutationIsSeedRecipe).map((mutation) => mutation.id);
  if (seedIds.length) {
    await clearMutations(seedIds);
  }
  const actionable = mutations.filter((mutation) => !mutationIsSeedRecipe(mutation));
  if (!actionable.length) {
    return { ok: true, synced: 0 };
  }

  // Strip huge inline images from mutation payloads; promote memory photos first.
  const client = getSupabaseBrowserClient();
  const {
    data: { user },
  } = client ? await client.auth.getUser() : { data: { user: null } };

  const cleaned = [];
  for (const mutation of actionable) {
    if (
      mutation.entity === "recipe" &&
      mutation.operation === "upsert" &&
      mutation.payload &&
      typeof mutation.payload === "object"
    ) {
      const recipe = mutation.payload as Recipe;
      const prepared = user?.id
        ? (await prepareRecipesForRemotePush([recipe], user.id))[0]
        : stripInlineDataUrls(recipe);
      cleaned.push({ ...mutation, payload: prepared });
      continue;
    }
    cleaned.push(mutation);
  }

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

/**
 * Queue-first backup: flush pending mutations, then only push recipes that
 * still need a first-time / catch-up upload (no lastOkAt yet, or updated
 * after last successful sync and not represented in the queue).
 */
export async function backupVaultToCloud(
  accessToken: string,
  options?: { forceFull?: boolean }
): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You are offline." };
  }

  const deletedIds = await getPendingDeletedRecipeIds();
  const flushFirst = await flushSyncQueue(accessToken);
  if (!flushFirst.ok && (flushFirst.synced ?? 0) === 0 && flushFirst.error) {
    return flushFirst;
  }

  const client = getSupabaseBrowserClient();
  const {
    data: { user },
  } = client ? await client.auth.getUser() : { data: { user: null } };

  const recipes = recipesForCloudPush(
    (await listRecipes()).filter((recipe) => !deletedIds.has(recipe.id))
  );

  const lastOkAt = getCloudSyncStatus().lastOkAt;
  const forceFull = Boolean(options?.forceFull);
  const needsCatchUp = forceFull || !lastOkAt;

  let toPush: Recipe[] = [];
  if (needsCatchUp) {
    toPush = recipes;
  } else {
    const sinceMs = Date.parse(lastOkAt);
    toPush = recipes.filter((recipe) => {
      const updated = Date.parse(recipe.updated_at);
      return Number.isFinite(updated) && Number.isFinite(sinceMs) && updated > sinceMs;
    });
  }

  // After a successful queue flush, dirty recipes should already be on the
  // cloud. Only catch-up-push when there was nothing queued (e.g. first sync
  // after sign-in, or edits that bypassed the queue).
  if ((flushFirst.synced ?? 0) > 0 && !forceFull && lastOkAt) {
    toPush = [];
  }

  const pushed = await pushRecipes(accessToken, toPush, user?.id);
  if (!pushed.ok) {
    return {
      ok: false,
      synced: (flushFirst.synced ?? 0) + (pushed.synced ?? 0),
      error: pushed.error,
    };
  }

  const flush = await flushSyncQueue(accessToken);
  return {
    ok: flush.ok !== false,
    synced:
      (flushFirst.synced ?? 0) + (pushed.synced ?? 0) + (flush.synced ?? 0),
    reason: flush.reason,
    error: flush.error,
  };
}

/** Pull cloud recipes (optionally since last sync) and merge into Dexie. */
export async function restoreVaultFromCloud(
  accessToken: string,
  options?: { since?: string | null; full?: boolean }
): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You are offline." };
  }

  const since =
    options?.full
      ? null
      : options?.since !== undefined
        ? options.since
        : deltaSinceCursor(getCloudSyncStatus().lastOkAt);

  let recipes: Recipe[] | undefined;
  let apiError: string | undefined;

  try {
    const endpoint = since
      ? `${syncEndpoint()}?since=${encodeURIComponent(since)}`
      : syncEndpoint();
    const res = await fetch(endpoint, {
      method: "GET",
      headers: await authHeaders(accessToken),
    });
    const data = await readSyncResponse(res);
    if (data.ok && Array.isArray(data.recipes)) {
      recipes = data.recipes;
    } else if (!data.ok) {
      apiError = data.error ?? "Pull failed";
    }
  } catch (err) {
    apiError = friendlyNetworkError(err);
  }

  if (recipes === undefined) {
    try {
      const direct = await pullRecipesViaSupabase(since);
      if (direct) recipes = direct;
    } catch (err) {
      if (apiError) {
        return { ok: false, error: apiError };
      }
      return { ok: false, error: friendlyNetworkError(err) };
    }
  }

  if (recipes === undefined) {
    return { ok: false, error: apiError ?? "Pull failed" };
  }

  const deletedIds = await getPendingDeletedRecipeIds();
  const { enqueueMutation } = await import("@/lib/db/queries");

  let pulled = 0;
  for (const remote of recipes) {
    if (deletedIds.has(remote.id)) {
      await enqueueMutation({
        entity: "recipe",
        operation: "delete",
        payload: { id: remote.id },
      });
      continue;
    }
    const db = getDb();
    const local = await db.recipes.get(remote.id);
    const resolution = resolveRecipePullConflict(remote, local);

    if (resolution.pushLocal && local) {
      await enqueueMutation({
        entity: "recipe",
        operation: "upsert",
        payload: local,
      });
      continue;
    }

    if (resolution.appliedRemote) {
      await upsertRecipe(withDerivedCooked(resolution.recipe), false);
      pulled += 1;
    }
  }
  await refreshTags();
  // Don't notifyVaultChanged here — that would bounce into another push loop.
  // Callers flush the queue after pull when needed.

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
