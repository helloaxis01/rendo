import type { Recipe } from "@/lib/db/types";

export function mapRemoteRecipe(
  row: Record<string, unknown>,
  children: {
    ingredients: Record<string, unknown>[];
    steps: Record<string, unknown>[];
    tags: Record<string, unknown>[];
    notes: Record<string, unknown>[];
  }
): Recipe {
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
    cover_display: (row.cover_display as Recipe["cover_display"]) ?? "photo",
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
      row.rating == null ? null : Math.max(1, Math.min(5, Number(row.rating))),
  };
}

export function assembleRecipes(
  rows: Record<string, unknown>[],
  ingredients: Record<string, unknown>[],
  steps: Record<string, unknown>[],
  tags: Record<string, unknown>[],
  notes: Record<string, unknown>[]
): Recipe[] {
  const group = (list: Record<string, unknown>[]) => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of list) {
      const id = String(row.recipe_id);
      const next = map.get(id) ?? [];
      next.push(row);
      map.set(id, next);
    }
    return map;
  };

  const byIng = group(ingredients);
  const byStep = group(steps);
  const byTag = group(tags);
  const byNote = group(notes);

  return rows.map((row) => {
    const id = String(row.id);
    return mapRemoteRecipe(row, {
      ingredients: byIng.get(id) ?? [],
      steps: byStep.get(id) ?? [],
      tags: byTag.get(id) ?? [],
      notes: byNote.get(id) ?? [],
    });
  });
}
