import { NextResponse } from "next/server";
import {
  getSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { Recipe, SyncMutation } from "@/lib/db/types";

type SyncBody = {
  mutations?: SyncMutation[];
};

async function upsertRecipeRemote(recipe: Recipe, userId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { error } = await supabase.from("recipes").upsert({
    id: recipe.id,
    user_id: userId,
    title: recipe.title,
    source_handle: recipe.source_handle,
    source_url: recipe.source_url,
    prep_time_minutes: recipe.prep_time_minutes,
    servings_base: recipe.servings_base,
    cover_image_url: recipe.cover_image_url,
    cover_fallback_label: recipe.cover_fallback_label ?? null,
    is_favorite: recipe.is_favorite,
    updated_at: recipe.updated_at,
    created_at: recipe.created_at,
    last_opened_at: recipe.last_opened_at ?? null,
  });

  if (error) throw error;

  await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipe.id);
  await supabase.from("recipe_steps").delete().eq("recipe_id", recipe.id);
  await supabase.from("recipe_tags").delete().eq("recipe_id", recipe.id);
  await supabase.from("kitchen_notes").delete().eq("recipe_id", recipe.id);

  if (recipe.ingredients_normalized.length) {
    await supabase.from("recipe_ingredients").insert(
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
  }

  if (recipe.steps.length) {
    await supabase.from("recipe_steps").insert(
      recipe.steps.map((step) => ({
        id: `${recipe.id}_step_${step.step_number}`,
        recipe_id: recipe.id,
        step_number: step.step_number,
        action_header: step.action_header,
        instruction: step.instruction,
        timer_seconds: step.timer_seconds ?? null,
      }))
    );
  }

  if (recipe.tags.length) {
    await supabase.from("recipe_tags").insert(
      recipe.tags.map((tag) => ({ recipe_id: recipe.id, tag }))
    );
  }

  if (recipe.kitchen_notes.length) {
    await supabase.from("kitchen_notes").insert(
      recipe.kitchen_notes.map((note) => ({
        id: note.id,
        recipe_id: recipe.id,
        text: note.text,
        created_at: note.created_at,
      }))
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncBody;
    const mutations = body.mutations ?? [];

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        synced: 0,
        skipped: mutations.length,
        reason: "Supabase env not configured — local queue retained for later flush.",
      });
    }

    const userId = request.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing x-user-id header (auth scaffold).",
        },
        { status: 401 }
      );
    }

    const applied: string[] = [];

    for (const mutation of mutations) {
      if (mutation.entity === "recipe" && mutation.operation === "upsert") {
        await upsertRecipeRemote(mutation.payload as Recipe, userId);
        applied.push(mutation.id);
      } else if (mutation.entity === "recipe" && mutation.operation === "delete") {
        const supabase = getSupabaseServerClient();
        const id = (mutation.payload as { id: string }).id;
        await supabase?.from("recipes").delete().eq("id", id).eq("user_id", userId);
        applied.push(mutation.id);
      } else {
        // preference/tag sync is local-primary in Phase 1
        applied.push(mutation.id);
      }
    }

    return NextResponse.json({ ok: true, synced: applied.length, applied });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
