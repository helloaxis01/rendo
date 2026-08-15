"use client";

import { listRecipes, upsertRecipe } from "@/lib/db/queries";
import { needsGeminiSubtitle } from "@/lib/extract/subtitle";
import type { Recipe } from "@/lib/db/types";

let inFlight: Promise<number> | null = null;

async function requestGeminiSubtitle(recipe: Recipe): Promise<string | null> {
  const res = await fetch("/api/subtitle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: recipe.title,
      ingredients_normalized: recipe.ingredients_normalized,
      steps: recipe.steps,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { subtitle?: string | null };
  return data.subtitle?.trim() || null;
}

/**
 * One-time Gemini backfill for photo-less recipes with no valid subtitle.
 * Skips user About lines. Does not invent on-device replacements.
 */
export async function backfillPhotolessSubtitles(): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const recipes = await listRecipes();
    const pending = recipes.filter(needsGeminiSubtitle);
    let updated = 0;
    for (const recipe of pending) {
      try {
        const subtitle = await requestGeminiSubtitle(recipe);
        if (!subtitle) continue;
        await upsertRecipe({
          ...recipe,
          subtitle,
          subtitle_manual: false,
          updated_at: new Date().toISOString(),
        });
        updated += 1;
      } catch {
        // Leave empty and try again on a later launch.
      }
    }
    return updated;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
