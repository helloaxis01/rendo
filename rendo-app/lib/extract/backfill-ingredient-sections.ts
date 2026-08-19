"use client";

import { listRecipes, upsertRecipe } from "@/lib/db/queries";
import { needsIngredientSections } from "@/lib/recipe/ingredient-sections";
import type { Ingredient, Recipe } from "@/lib/db/types";

const SKIP_KEY = "rendo_section_backfill_v1";
const MAX_PER_LAUNCH = 6;

let inFlight: Promise<number> | null = null;

function skippedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SKIP_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function markSkipped(id: string) {
  const next = skippedIds();
  next.add(id);
  localStorage.setItem(SKIP_KEY, JSON.stringify([...next]));
}

async function requestSections(recipe: Recipe): Promise<Ingredient[] | null> {
  const res = await fetch("/api/ingredient-sections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: recipe.title,
      source_url: recipe.source_url,
      ingredients_normalized: recipe.ingredients_normalized,
      steps: recipe.steps,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { ingredients?: Ingredient[] | null };
  return data.ingredients ?? null;
}

/**
 * Reimport or retag recipes whose ingredient groups were flattened
 * (olive oil listed two or three times with no headings).
 */
export async function backfillIngredientSections(): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const recipes = await listRecipes();
    const done = skippedIds();
    const pending = recipes
      .filter((recipe) => needsIngredientSections(recipe) && !done.has(recipe.id))
      .slice(0, MAX_PER_LAUNCH);
    let updated = 0;
    for (const recipe of pending) {
      try {
        const ingredients = await requestSections(recipe);
        if (!ingredients?.some((ing) => ing.section?.trim())) {
          markSkipped(recipe.id);
          continue;
        }
        await upsertRecipe({
          ...recipe,
          ingredients_normalized: ingredients,
          updated_at: new Date().toISOString(),
        });
        markSkipped(recipe.id);
        updated += 1;
      } catch {
        // Network/model blip; try again on a later launch.
      }
    }
    return updated;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
