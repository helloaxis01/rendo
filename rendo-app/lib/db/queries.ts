import { rebuildTagsFromRecipes, SEED_RECIPES } from "@/data/seed-recipes";
import { getDb } from "@/lib/db";
import type {
  KitchenNote,
  Preferences,
  Recipe,
  SyncMutation,
} from "@/lib/db/types";

export async function ensureSeeded() {
  const db = getDb();
  const count = await db.recipes.count();
  if (count > 0) return;

  await db.transaction("rw", db.recipes, db.tags, db.preferences, async () => {
    await db.recipes.bulkPut(SEED_RECIPES);
    await db.tags.bulkPut(rebuildTagsFromRecipes(SEED_RECIPES));
    const existingPrefs = await db.preferences.get("app");
    if (!existingPrefs) {
      await db.preferences.put({
        id: "app",
        theme: "light",
        unit_system: "imperial",
        library_view: "tiles",
        library_sort: "recently_added",
      });
    }
  });
}

export async function listRecipes(): Promise<Recipe[]> {
  const db = getDb();
  await ensureSeeded();
  return db.recipes.orderBy("updated_at").reverse().toArray();
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const db = getDb();
  await ensureSeeded();
  return db.recipes.get(id);
}

export async function upsertRecipe(recipe: Recipe, enqueue = true) {
  const db = getDb();
  await db.recipes.put(recipe);
  await refreshTags();
  if (enqueue) {
    await enqueueMutation({
      entity: "recipe",
      operation: "upsert",
      payload: recipe,
    });
  }
}

export async function deleteRecipe(id: string) {
  const db = getDb();
  await db.recipes.delete(id);
  await refreshTags();
  await enqueueMutation({
    entity: "recipe",
    operation: "delete",
    payload: { id },
  });
}

export function typographyLabelFor(recipe: Pick<Recipe, "title" | "cover_fallback_label">) {
  if (recipe.cover_fallback_label?.trim()) return recipe.cover_fallback_label;
  const words = recipe.title.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join("\n");
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(" ")}\n${words.slice(mid).join(" ")}`;
}

export async function setCoverDisplay(
  id: string,
  cover_display: NonNullable<Recipe["cover_display"]>
) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  await upsertRecipe({
    ...recipe,
    cover_display,
    cover_fallback_label:
      recipe.cover_fallback_label ?? typographyLabelFor(recipe),
    updated_at: new Date().toISOString(),
  });
}

export async function setUserCoverImage(
  id: string,
  dataUrl: string,
  position?: string | null
) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  await upsertRecipe({
    ...recipe,
    user_cover_image_url: dataUrl,
    user_cover_image_position: position ?? recipe.user_cover_image_position ?? "50% 50%",
    cover_display: "mine",
    updated_at: new Date().toISOString(),
  });
}

export async function setCoverImagePosition(
  id: string,
  which: "photo" | "mine",
  position: string
) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  await upsertRecipe({
    ...recipe,
    ...(which === "mine"
      ? { user_cover_image_position: position }
      : { cover_image_position: position }),
    updated_at: new Date().toISOString(),
  });
}

export async function toggleFavorite(id: string) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  await upsertRecipe({
    ...recipe,
    is_favorite: !recipe.is_favorite,
    updated_at: new Date().toISOString(),
  });
}

export async function markOpened(id: string) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  await upsertRecipe(
    {
      ...recipe,
      last_opened_at: new Date().toISOString(),
      times_cooked: (recipe.times_cooked ?? 0) + 1,
    },
    false
  );
}

export async function setIngredientChecked(
  recipeId: string,
  ingredientId: string,
  checked: boolean
) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;
  await upsertRecipe({
    ...recipe,
    ingredients_normalized: recipe.ingredients_normalized.map((ing) =>
      ing.id === ingredientId ? { ...ing, checked } : ing
    ),
    updated_at: new Date().toISOString(),
  });
}

export async function setRecipeTags(recipeId: string, tags: string[]) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;
  const cleaned = [
    ...new Map(
      tags
        .map((t) => t.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .map((t) => [t.toLowerCase(), t] as const)
    ).values(),
  ];
  await upsertRecipe({
    ...recipe,
    tags: cleaned,
    updated_at: new Date().toISOString(),
  });
}

export async function appendKitchenNote(recipeId: string, text: string) {
  const recipe = await getRecipe(recipeId);
  if (!recipe || !text.trim()) return;

  const stamp = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const note: KitchenNote = {
    id: `note_${crypto.randomUUID()}`,
    text: `${stamp}: ${text.trim()}`,
    created_at: new Date().toISOString(),
  };

  await upsertRecipe({
    ...recipe,
    kitchen_notes: [...recipe.kitchen_notes, note],
    updated_at: new Date().toISOString(),
  });
}

export async function refreshTags() {
  const db = getDb();
  const recipes = await db.recipes.toArray();
  await db.tags.clear();
  await db.tags.bulkPut(rebuildTagsFromRecipes(recipes));
}

export async function listTags() {
  const db = getDb();
  await ensureSeeded();
  return db.tags.orderBy("name").toArray();
}

const DEFAULT_PREFERENCES: Preferences = {
  id: "app",
  theme: "light",
  unit_system: "imperial",
  library_view: "tiles",
  library_sort: "recently_added",
  filter_pill_order: [],
};

export async function getPreferences(): Promise<Preferences> {
  const db = getDb();
  await ensureSeeded();
  const prefs = await db.preferences.get("app");
  return {
    ...DEFAULT_PREFERENCES,
    ...prefs,
    id: "app",
    filter_pill_order: prefs?.filter_pill_order ?? [],
  };
}

export async function setPreferences(patch: Partial<Omit<Preferences, "id">>) {
  const db = getDb();
  const current = await getPreferences();
  const next = { ...current, ...patch };
  await db.preferences.put(next);
  await enqueueMutation({
    entity: "preference",
    operation: "upsert",
    payload: next,
  });
  return next;
}

/** Keep existing tag pill order; append newly seen tags; drop tags that disappeared. */
export async function ensureFilterPillOrder(
  tagNames: string[]
): Promise<string[]> {
  const prefs = await getPreferences();
  const previous = prefs.filter_pill_order ?? [];
  const byLower = new Map(tagNames.map((n) => [n.toLowerCase(), n]));

  const kept: string[] = [];
  const seen = new Set<string>();
  for (const name of previous) {
    const key = name.toLowerCase();
    const currentName = byLower.get(key);
    if (!currentName || seen.has(key)) continue;
    kept.push(currentName);
    seen.add(key);
  }

  const appended = tagNames.filter((name) => !seen.has(name.toLowerCase()));
  const next = [...kept, ...appended];

  const unchanged =
    next.length === previous.length &&
    next.every((name, i) => name === previous[i]);

  if (!unchanged) {
    await setPreferences({ filter_pill_order: next });
  }

  return next;
}

export async function enqueueMutation(
  input: Omit<SyncMutation, "id" | "created_at" | "attempts">
) {
  const db = getDb();
  await db.sync_queue.add({
    id: `mut_${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
    attempts: 0,
    ...input,
  });
}

export async function getPendingMutations() {
  const db = getDb();
  return db.sync_queue.orderBy("created_at").toArray();
}

export async function clearMutations(ids: string[]) {
  const db = getDb();
  await db.sync_queue.bulkDelete(ids);
}

export function filterRecipes(
  recipes: Recipe[],
  opts: {
    query: string;
    filter: string | null;
    sort?: Preferences["library_sort"];
  }
) {
  const q = opts.query.trim().toLowerCase();
  let result = recipes;

  if (opts.filter === "favorites") {
    result = result.filter((r) => r.is_favorite);
  } else if (opts.filter === "recent") {
    result = [...result]
      .filter((r) => r.last_opened_at)
      .sort((a, b) =>
        (b.last_opened_at ?? "").localeCompare(a.last_opened_at ?? "")
      );
  } else if (opts.filter) {
    result = result.filter((r) =>
      r.tags.some((t) => t.toLowerCase() === opts.filter!.toLowerCase())
    );
  }

  if (q) {
    result = result.filter((r) => {
      const haystack = [
        r.title,
        r.source_handle ?? "",
        ...r.tags,
        ...r.ingredients_normalized.map((i) => i.name),
        ...r.ingredients_normalized.map((i) => i.search_key),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  if (opts.filter === "recent") return result;

  const sort = opts.sort ?? "recently_added";
  const sorted = [...result];
  if (sort === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "prep_time") {
    sorted.sort((a, b) => a.prep_time_minutes - b.prep_time_minutes);
  } else if (sort === "most_cooked") {
    sorted.sort(
      (a, b) => (b.times_cooked ?? 0) - (a.times_cooked ?? 0)
    );
  } else {
    sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return sorted;
}
