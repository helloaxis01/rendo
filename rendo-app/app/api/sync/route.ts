import { NextResponse } from "next/server";
import {
  getSupabaseServerClient,
  getUserFromRequest,
  isSupabaseConfigured,
} from "@/lib/supabase/auth-server";
import type { Recipe, SyncMutation } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

type SyncBody = {
  mutations?: SyncMutation[];
  recipes?: Recipe[];
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Sync failed";
}

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

function mapRemoteRecipe(row: Record<string, unknown>, children: {
  ingredients: Record<string, unknown>[];
  steps: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  notes: Record<string, unknown>[];
}): Recipe {
  return {
    id: String(row.id),
    title: String(row.title),
    source_handle: (row.source_handle as string | null) ?? null,
    source_url: (row.source_url as string | null) ?? null,
    prep_time_minutes: Number(row.prep_time_minutes ?? 0),
    servings_base: Number(row.servings_base ?? 4),
    cover_image_url: (row.cover_image_url as string | null) ?? null,
    user_cover_image_url: (row.user_cover_image_url as string | null) ?? null,
    cover_image_position: (row.cover_image_position as string | null) ?? null,
    user_cover_image_position:
      (row.user_cover_image_position as string | null) ?? null,
    cover_fallback_label: (row.cover_fallback_label as string | null) ?? null,
    cover_display:
      (row.cover_display as Recipe["cover_display"]) ?? "photo",
    is_favorite: Boolean(row.is_favorite),
    tags: children.tags.map((t) => String(t.tag)),
    ingredients_normalized: children.ingredients
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((ing) => ({
        id: String(ing.id).includes("_")
          ? String(ing.id).split("_").slice(-1)[0]
          : String(ing.id),
        amount: ing.amount == null ? null : Number(ing.amount),
        unit: (ing.unit as string | null) ?? null,
        name: String(ing.name),
        search_key: String(ing.search_key),
        checked: Boolean(ing.checked),
      })),
    steps: children.steps
      .sort((a, b) => Number(a.step_number) - Number(b.step_number))
      .map((step) => ({
        step_number: Number(step.step_number),
        action_header: String(step.action_header),
        instruction: String(step.instruction),
        timer_seconds:
          step.timer_seconds == null ? null : Number(step.timer_seconds),
      })),
    kitchen_notes: children.notes.map((note) => ({
      id: String(note.id),
      text: String(note.text),
      created_at: String(note.created_at),
    })),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_opened_at: (row.last_opened_at as string | null) ?? null,
    times_cooked:
      row.times_cooked == null ? undefined : Number(row.times_cooked),
    cooked: Boolean(row.cooked),
    rating:
      row.rating == null
        ? null
        : Math.max(1, Math.min(5, Number(row.rating))),
  };
}

async function resolveUserCoverUrl(
  supabase: SupabaseClient,
  recipe: Recipe,
  userId: string
): Promise<string | null> {
  const raw = recipe.user_cover_image_url ?? null;
  if (!raw) return null;
  // Never persist multi-MB data URLs in Postgres — upload or drop.
  if (!raw.startsWith("data:image/")) return raw;

  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  // Cap ~1.5MB decoded — larger images should be compressed client-side.
  if (match[2].length > 2_000_000) {
    console.warn("Skipping oversized user cover for", recipe.id);
    return null;
  }

  const contentType = match[1];
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const bytes = Buffer.from(match[2], "base64");
  const path = `${userId}/${recipe.id}.${ext}`;

  const { error } = await supabase.storage
    .from("recipe-media")
    .upload(path, bytes, { contentType, upsert: true });
  if (error) {
    // Keep syncing the rest of the recipe if storage isn't ready yet.
    console.warn("recipe-media upload failed", error.message);
    return null;
  }

  const { data } = supabase.storage.from("recipe-media").getPublicUrl(path);
  return data.publicUrl;
}

async function upsertRecipeRemote(
  supabase: SupabaseClient,
  recipe: Recipe,
  userId: string
) {
  const userCoverUrl = await resolveUserCoverUrl(supabase, recipe, userId);
  const coverImageUrl = recipe.cover_image_url?.startsWith("data:")
    ? null
    : recipe.cover_image_url;

  const coreRow = {
    id: recipe.id,
    user_id: userId,
    title: recipe.title,
    source_handle: recipe.source_handle,
    source_url: recipe.source_url,
    prep_time_minutes: recipe.prep_time_minutes,
    servings_base: recipe.servings_base,
    cover_image_url: coverImageUrl,
    cover_fallback_label: recipe.cover_fallback_label ?? null,
    cover_display: recipe.cover_display ?? "photo",
    is_favorite: recipe.is_favorite,
    updated_at: recipe.updated_at,
    created_at: recipe.created_at,
    last_opened_at: recipe.last_opened_at ?? null,
  };

  const fullRow = {
    ...coreRow,
    user_cover_image_url: userCoverUrl,
    cover_image_position: recipe.cover_image_position ?? null,
    user_cover_image_position: recipe.user_cover_image_position ?? null,
    times_cooked: recipe.times_cooked ?? 0,
    cooked: Boolean(recipe.cooked),
    rating: recipe.rating ?? null,
  };

  const { error } = await supabase.from("recipes").upsert(fullRow);

  if (error) {
    // Live schema may be missing later migrations — retry with core columns only.
    if (/column|schema cache/i.test(error.message)) {
      const { error: retryError } = await supabase
        .from("recipes")
        .upsert(coreRow);
      if (retryError) throw retryError;
    } else {
      throw error;
    }
  }

  await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipe.id);
  await supabase.from("recipe_steps").delete().eq("recipe_id", recipe.id);
  await supabase.from("recipe_tags").delete().eq("recipe_id", recipe.id);
  await supabase.from("kitchen_notes").delete().eq("recipe_id", recipe.id);

  if (recipe.ingredients_normalized.length) {
    const { error: ingErr } = await supabase.from("recipe_ingredients").insert(
      recipe.ingredients_normalized.map((ing, index) => ({
        id: ing.id.startsWith(recipe.id) ? ing.id : `${recipe.id}_${ing.id}`,
        recipe_id: recipe.id,
        amount: ing.amount,
        unit: ing.unit,
        name: ing.name,
        search_key: ing.search_key,
        checked: ing.checked ?? false,
        position: index,
      }))
    );
    if (ingErr) throw ingErr;
  }

  if (recipe.steps.length) {
    const { error: stepErr } = await supabase.from("recipe_steps").insert(
      recipe.steps.map((step) => ({
        id: `${recipe.id}_step_${step.step_number}`,
        recipe_id: recipe.id,
        step_number: step.step_number,
        action_header: step.action_header,
        instruction: step.instruction,
        timer_seconds: step.timer_seconds ?? null,
      }))
    );
    if (stepErr) throw stepErr;
  }

  if (recipe.tags.length) {
    const { error: tagErr } = await supabase.from("recipe_tags").insert(
      recipe.tags.map((tag) => ({ recipe_id: recipe.id, tag }))
    );
    if (tagErr) throw tagErr;
  }

  if (recipe.kitchen_notes.length) {
    const { error: noteErr } = await supabase.from("kitchen_notes").insert(
      recipe.kitchen_notes.map((note) => ({
        id: note.id,
        recipe_id: recipe.id,
        text: note.text,
        created_at: note.created_at,
      }))
    );
    if (noteErr) throw noteErr;
  }
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: false,
        error: "Supabase is not configured.",
      }, { status: 503 });
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(bearerToken(request));
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Server client unavailable" }, { status: 503 });
    }

    const { data: rows, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const recipes: Recipe[] = [];
    for (const row of rows ?? []) {
      const id = String(row.id);
      const [ingredients, steps, tags, notes] = await Promise.all([
        supabase.from("recipe_ingredients").select("*").eq("recipe_id", id),
        supabase.from("recipe_steps").select("*").eq("recipe_id", id),
        supabase.from("recipe_tags").select("*").eq("recipe_id", id),
        supabase.from("kitchen_notes").select("*").eq("recipe_id", id),
      ]);

      recipes.push(
        mapRemoteRecipe(row, {
          ingredients: ingredients.data ?? [],
          steps: steps.data ?? [],
          tags: tags.data ?? [],
          notes: notes.data ?? [],
        })
      );
    }

    return NextResponse.json({ ok: true, recipes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncBody;
    const mutations = body.mutations ?? [];
    const bulkRecipes = body.recipes ?? [];

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        synced: 0,
        skipped: mutations.length + bulkRecipes.length,
        reason:
          "Supabase env not configured — local queue retained for later flush.",
      });
    }

    const token = bearerToken(request);
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Sign in required to sync." },
        { status: 401 }
      );
    }

    const supabase = getSupabaseServerClient(token);
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Server client unavailable" },
        { status: 503 }
      );
    }

    // Ensure profile row exists for FK / RLS convenience
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email ??
        null,
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw profileError;

    const applied: string[] = [];

    for (const recipe of bulkRecipes) {
      await upsertRecipeRemote(supabase, recipe, user.id);
      applied.push(recipe.id);
    }

    for (const mutation of mutations) {
      if (mutation.entity === "recipe" && mutation.operation === "upsert") {
        await upsertRecipeRemote(supabase, mutation.payload as Recipe, user.id);
        applied.push(mutation.id);
      } else if (
        mutation.entity === "recipe" &&
        mutation.operation === "delete"
      ) {
        const id = (mutation.payload as { id: string }).id;
        const { error } = await supabase
          .from("recipes")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        applied.push(mutation.id);
      } else {
        applied.push(mutation.id);
      }
    }

    return NextResponse.json({
      ok: true,
      synced: applied.length,
      applied,
      user_id: user.id,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
