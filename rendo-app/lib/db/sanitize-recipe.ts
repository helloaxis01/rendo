import type { Recipe } from "@/lib/db/types";
import { decodeHtmlEntities } from "@/lib/text/html-entities";

function clean(value: string): string {
  return decodeHtmlEntities(value);
}

function cleanNullable(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  return clean(value);
}

/** Fix garbled HTML entities in stored / extracted recipe text. */
export function sanitizeRecipeText(recipe: Recipe): Recipe {
  return {
    ...recipe,
    title: clean(recipe.title),
    subtitle: cleanNullable(recipe.subtitle) ?? null,
    subtitle_manual: Boolean(recipe.subtitle_manual),
    source_handle: cleanNullable(recipe.source_handle) ?? null,
    source_url: cleanNullable(recipe.source_url) ?? null,
    cooked: Boolean(recipe.cooked),
    rating:
      recipe.rating == null
        ? null
        : Math.max(1, Math.min(5, Math.round(Number(recipe.rating)))),
    cover_fallback_label: cleanNullable(recipe.cover_fallback_label),
    tags: recipe.tags.map(clean),
    ingredients_normalized: recipe.ingredients_normalized.map((ing) => ({
      ...ing,
      name: clean(ing.name),
      unit: ing.unit == null ? null : clean(ing.unit),
      search_key: clean(ing.search_key),
    })),
    steps: recipe.steps.map((step) => ({
      ...step,
      action_header: clean(step.action_header),
      instruction: clean(step.instruction),
    })),
    kitchen_notes: recipe.kitchen_notes.map((note) => ({
      ...note,
      text: clean(note.text),
    })),
  };
}
