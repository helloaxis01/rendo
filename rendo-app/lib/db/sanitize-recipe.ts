import type { Recipe } from "@/lib/db/types";
import { decodeHtmlEntities } from "@/lib/text/html-entities";
import { flattenTags } from "@/lib/extract/clean-recipe";

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
    tags: flattenTags(recipe.tags.map(clean)),
    ingredients_normalized: recipe.ingredients_normalized.map((ing) => ({
      ...ing,
      name: clean(ing.name),
      unit: ing.unit == null ? null : clean(ing.unit),
      search_key: clean(ing.search_key),
      raw_text: ing.raw_text == null ? null : clean(ing.raw_text),
      preparation_notes:
        ing.preparation_notes == null ? null : clean(ing.preparation_notes),
      confidence_score:
        ing.confidence_score == null
          ? null
          : Math.min(1, Math.max(0, Number(ing.confidence_score))),
      section: cleanNullable(ing.section) ?? null,
    })),
    steps: recipe.steps.map((step) => ({
      ...step,
      action_header: clean(step.action_header),
      instruction: clean(step.instruction),
    })),
    kitchen_notes: (recipe.kitchen_notes ?? []).map((note) => ({
      ...note,
      text: clean(note.text),
    })),
    cook_events: (recipe.cook_events ?? []).map((event) => ({
      ...event,
      occasion: event.occasion == null ? null : clean(event.occasion),
      who: (event.who ?? []).map(clean),
      note: event.note == null ? null : clean(event.note),
      rating:
        event.rating == null
          ? null
          : Math.max(1, Math.min(5, Math.round(Number(event.rating)))),
      photo_urls: (event.photo_urls ?? [])
        .map((url) => clean(url))
        .filter(Boolean),
    })),
  };
}
