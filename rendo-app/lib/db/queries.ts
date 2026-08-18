import { rebuildTagsFromRecipes, SEED_RECIPES } from "@/data/seed-recipes";
import { getDb } from "@/lib/db";
import {
  forgetRecipe,
  rememberRecipe,
  rememberRecipes,
} from "@/lib/db/recipe-cache";
import { isUsableImageUrl } from "@/lib/cover";
import { sanitizeRecipeText } from "@/lib/db/sanitize-recipe";
import {
  appendCookEvent,
  applyLatestCookMemory,
  popLatestCookEvent,
  rememberCook,
  setLatestCookedAt,
  withDerivedCooked,
  type CookMemory,
} from "@/lib/db/cook-events";
import { validateGeminiSubtitle } from "@/lib/extract/subtitle";
import type {
  Ingredient,
  KitchenNote,
  Preferences,
  Recipe,
  RecipeStep,
  SyncMutation,
} from "@/lib/db/types";

export async function ensureSeeded() {
  const db = getDb();
  const count = await db.recipes.count();
  if (count === 0) {
    await db.transaction("rw", db.recipes, db.tags, db.preferences, async () => {
      await db.recipes.bulkPut(SEED_RECIPES);
      await db.tags.bulkPut(rebuildTagsFromRecipes(SEED_RECIPES));
      const existingPrefs = await db.preferences.get("app");
      if (!existingPrefs) {
        await db.preferences.put({
          id: "app",
          theme: "light",
          unit_system: "imperial",
          library_view: "two",
          library_sort: "recently_added",
        });
      }
    });
  }
  await repairThinSeedRecipes();
  await repairSeedPhotolessCovers();
  await repairSeedGeminiSubtitles();
  await clearInvalidAutoSubtitles();
}

/** Fill stub seed ingredient lists that never got a full pantry. */
async function repairThinSeedRecipes() {
  const db = getDb();
  for (const seed of SEED_RECIPES) {
    const existing = await db.recipes.get(seed.id);
    if (!existing) continue;
    if (
      existing.ingredients_normalized.length >=
      seed.ingredients_normalized.length
    ) {
      continue;
    }
    const next: Recipe = {
      ...existing,
      ingredients_normalized: seed.ingredients_normalized.map((ing) => ({
        ...ing,
        checked:
          existing.ingredients_normalized.find((row) => row.id === ing.id)
            ?.checked ?? false,
      })),
      updated_at: new Date().toISOString(),
    };
    await upsertRecipe(sanitizeRecipeText(next), true);
  }
}

/** Keep seed dishes that are meant to be type covers from staying on a stock photo. */
async function repairSeedPhotolessCovers() {
  const db = getDb();
  for (const seed of SEED_RECIPES) {
    if (seed.cover_display !== "type" && seed.cover_image_url) continue;
    const existing = await db.recipes.get(seed.id);
    if (!existing) continue;
    if (
      existing.cover_display === "mine" &&
      isUsableImageUrl(existing.user_cover_image_url)
    ) {
      continue;
    }
    if (
      existing.cover_display === "type" &&
      !isUsableImageUrl(existing.cover_image_url)
    ) {
      continue;
    }
    await upsertRecipe(
      {
        ...existing,
        cover_image_url: null,
        cover_display: "type",
        cover_fallback_label:
          seed.cover_fallback_label ?? existing.cover_fallback_label,
        updated_at: new Date().toISOString(),
      },
      true
    );
  }
}

/** Stamp a Gemini seed subtitle onto vault copies that still have none. */
async function repairSeedGeminiSubtitles() {
  const db = getDb();
  for (const seed of SEED_RECIPES) {
    const line = validateGeminiSubtitle(seed.subtitle, seed.title);
    if (!line) continue;
    const existing = await db.recipes.get(seed.id);
    if (!existing || existing.subtitle_manual) continue;
    if (validateGeminiSubtitle(existing.subtitle, existing.title)) continue;
    await upsertRecipe(
      {
        ...existing,
        subtitle: line,
        subtitle_manual: false,
        cover_image_url:
          existing.cover_display === "mine"
            ? existing.cover_image_url
            : seed.cover_image_url ?? null,
        cover_display:
          existing.cover_display === "mine"
            ? existing.cover_display
            : seed.cover_display ?? existing.cover_display,
        updated_at: new Date().toISOString(),
      },
      true
    );
  }
}

/** Drop non-About subtitles that were never valid Gemini lines. */
async function clearInvalidAutoSubtitles() {
  const db = getDb();
  const recipes = await db.recipes.toArray();
  for (const recipe of recipes) {
    if (recipe.subtitle_manual) continue;
    const valid = validateGeminiSubtitle(recipe.subtitle, recipe.title);
    if (!recipe.subtitle?.trim()) continue;
    if (valid && valid === recipe.subtitle.trim()) continue;
    await upsertRecipe(
      {
        ...recipe,
        subtitle: valid,
        subtitle_manual: false,
        updated_at: new Date().toISOString(),
      },
      true
    );
  }
}

export async function listRecipes(): Promise<Recipe[]> {
  const db = getDb();
  await ensureSeeded();
  const recipes = await db.recipes.orderBy("updated_at").reverse().toArray();
  const cleaned = recipes.map(sanitizeRecipeText);
  rememberRecipes(cleaned);
  return cleaned;
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const db = getDb();
  const recipe = await db.recipes.get(id);
  if (recipe) {
    const cleaned = sanitizeRecipeText(recipe);
    rememberRecipe(cleaned);
    return cleaned;
  }
  await ensureSeeded();
  const seeded = await db.recipes.get(id);
  if (!seeded) return undefined;
  const cleaned = sanitizeRecipeText(seeded);
  rememberRecipe(cleaned);
  return cleaned;
}

export async function upsertRecipe(recipe: Recipe, enqueue = true) {
  const db = getDb();
  const existing = await db.recipes.get(recipe.id);
  const withManual =
    existing?.subtitle_manual && !recipe.subtitle_manual
      ? {
          ...recipe,
          subtitle: existing.subtitle,
          subtitle_manual: true,
        }
      : recipe;
  const cleaned = sanitizeRecipeText(withManual);
  const next = withDerivedCooked(cleaned);
  rememberRecipe(next);
  await db.recipes.put(next);
  await refreshTags();
  if (enqueue) {
    await enqueueMutation({
      entity: "recipe",
      operation: "upsert",
      payload: next,
    });
    notifyVaultChanged();
  }
}

/** Broadcast so auto-backup can debounce a cloud push after local edits. */
export function notifyVaultChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("rendo:vault-changed"));
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Distinct recipes marked cooked in the last 7 days. */
export function countCookedThisWeek(recipes: Recipe[]): number {
  const cutoff = Date.now() - WEEK_MS;
  return recipes.reduce((count, recipe) => {
    const raw = recipe.last_cooked_at;
    if (!raw) return count;
    const at = Date.parse(raw);
    if (!Number.isFinite(at) || at < cutoff) return count;
    return count + 1;
  }, 0);
}

export async function deleteRecipe(id: string) {
  const db = getDb();
  forgetRecipe(id);
  await db.recipes.delete(id);
  await refreshTags();
  const { rememberDeletedRecipe } = await import("@/lib/db/deleted");
  rememberDeletedRecipe(id);
  await enqueueMutation({
    entity: "recipe",
    operation: "delete",
    payload: { id },
  });
  notifyVaultChanged();
}

/** Type-cover label always mirrors the current recipe title. */
export function typographyLabelFor(recipe: Pick<Recipe, "title">) {
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
  const db = getDb();
  // Patch only — never rewrite the whole recipe (avoids clobbering rating/cooked).
  await db.recipes.update(id, {
    last_opened_at: new Date().toISOString(),
  });
}

export async function setRecipeCooked(id: string, cooked: boolean) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  const now = new Date().toISOString();
  const next = cooked
    ? appendCookEvent(recipe, now).recipe
    : popLatestCookEvent(recipe);
  await upsertRecipe({
    ...next,
    updated_at: now,
  });
}

export async function setLastCookedAt(id: string, iso: string) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  await upsertRecipe({
    ...setLatestCookedAt(recipe, iso),
    updated_at: new Date().toISOString(),
  });
}

export async function updateLatestCookMemory(
  id: string,
  memory: CookMemory
) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  await upsertRecipe({
    ...applyLatestCookMemory(recipe, memory),
    updated_at: new Date().toISOString(),
  });
}

export async function saveCookMemory(id: string, memory: CookMemory) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  await upsertRecipe({
    ...rememberCook(recipe, memory),
    updated_at: new Date().toISOString(),
  });
}

export async function setRecipeRating(
  id: string,
  rating: number | null
) {
  const recipe = await getRecipe(id);
  if (!recipe) return;
  const next =
    rating == null || !Number.isFinite(rating)
      ? null
      : Math.max(1, Math.min(5, Math.round(rating)));
  const now = new Date().toISOString();
  const markingCooked = next != null && !recipe.cooked;
  const withCook = markingCooked
    ? appendCookEvent(recipe, now).recipe
    : recipe;
  await upsertRecipe({
    ...withCook,
    rating: next,
    updated_at: now,
  });
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

export async function updateRecipeTitle(recipeId: string, title: string) {
  const recipe = await getRecipe(recipeId);
  const next = title.trim();
  if (!recipe || !next) return;

  await upsertRecipe({
    ...recipe,
    title: next,
    cover_fallback_label: typographyLabelFor({ title: next }),
    updated_at: new Date().toISOString(),
  });
}

export async function updateRecipeSubtitle(
  recipeId: string,
  subtitle: string | null
) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;
  const next = subtitle?.replace(/\s+/g, " ").trim() || null;
  await upsertRecipe({
    ...recipe,
    subtitle: next,
    subtitle_manual: true,
    updated_at: new Date().toISOString(),
  });
}

export async function updateRecipeSource(
  recipeId: string,
  source: { handle: string | null; url: string | null }
) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;
  await upsertRecipe({
    ...recipe,
    source_handle: source.handle,
    source_url: source.url,
    updated_at: new Date().toISOString(),
  });
}

export async function updatePrepTimeMinutes(
  recipeId: string,
  prep_time_minutes: number
) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;
  const minutes = Math.max(0, Math.min(24 * 60, Math.round(prep_time_minutes)));
  await upsertRecipe({
    ...recipe,
    prep_time_minutes: minutes,
    updated_at: new Date().toISOString(),
  });
}

export async function updateRecipeIngredients(
  recipeId: string,
  ingredients: Ingredient[]
) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;
  await upsertRecipe({
    ...recipe,
    ingredients_normalized: ingredients,
    updated_at: new Date().toISOString(),
  });
}

export async function updateRecipeSteps(recipeId: string, steps: RecipeStep[]) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;
  const normalized = steps.map((step, index) => ({
    ...step,
    step_number: index + 1,
  }));
  await upsertRecipe({
    ...recipe,
    steps: normalized,
    updated_at: new Date().toISOString(),
  });
}

export async function appendKitchenNote(recipeId: string, text: string) {
  const recipe = await getRecipe(recipeId);
  if (!recipe || !text.trim()) return;

  const note: KitchenNote = {
    id: `note_${crypto.randomUUID()}`,
    text: text.trim(),
    created_at: new Date().toISOString(),
  };

  await upsertRecipe({
    ...recipe,
    kitchen_notes: [...recipe.kitchen_notes, note],
    updated_at: new Date().toISOString(),
  });
}

export async function updateKitchenNote(
  recipeId: string,
  noteId: string,
  text: string
) {
  const recipe = await getRecipe(recipeId);
  if (!recipe || !text.trim()) return;

  await upsertRecipe({
    ...recipe,
    kitchen_notes: recipe.kitchen_notes.map((note) =>
      note.id === noteId ? { ...note, text: text.trim() } : note
    ),
    updated_at: new Date().toISOString(),
  });
}

export async function deleteKitchenNote(recipeId: string, noteId: string) {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return;

  await upsertRecipe({
    ...recipe,
    kitchen_notes: recipe.kitchen_notes.filter((note) => note.id !== noteId),
    updated_at: new Date().toISOString(),
  });
}

export async function refreshTags() {
  const db = getDb();
  const recipes = await db.recipes.toArray();
  const existing = await db.tags.toArray();
  const prefs = await db.preferences.get("app");
  const rebuilt = rebuildTagsFromRecipes(recipes);
  const byKey = new Map(
    rebuilt.map((tag) => [tag.name.toLowerCase(), tag] as const)
  );

  const remembered = [
    ...existing.map((tag) => tag.name),
    ...(prefs?.catalog_tags ?? []),
  ];
  for (const name of remembered) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key.replace(/\s+/g, "_"),
        name: trimmed,
        count: 0,
      });
    }
  }

  const next = [...byKey.values()];
  await db.tags.clear();
  await db.tags.bulkPut(next);

  const catalog = next
    .map((tag) => tag.name)
    .sort((a, b) => a.localeCompare(b));
  const prevCatalog = prefs?.catalog_tags ?? [];
  const same =
    catalog.length === prevCatalog.length &&
    catalog.every((name, i) => name === prevCatalog[i]);
  if (!same) {
    await db.preferences.put({
      ...DEFAULT_PREFERENCES,
      ...prefs,
      id: "app",
      catalog_tags: catalog,
    });
  }
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
  library_view: "two",
  library_sort: "recently_added",
  keep_screen_awake: true,
  filter_pill_order: [],
  catalog_tags: [],
};

function normalizeLibraryView(value: unknown): Preferences["library_view"] {
  if (value === "one" || value === "list") return "one";
  return "two";
}

export async function getPreferences(): Promise<Preferences> {
  const db = getDb();
  await ensureSeeded();
  const prefs = await db.preferences.get("app");
  return {
    ...DEFAULT_PREFERENCES,
    ...prefs,
    id: "app",
    library_view: normalizeLibraryView(prefs?.library_view),
    keep_screen_awake: prefs?.keep_screen_awake ?? true,
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
  const rawQuery = opts.query.trim().toLowerCase();
  const tokens = tokenizeSearch(rawQuery);
  let result = recipes;

  // Tag pills still filter. Favorites / Recent / Cooked only re-order
  // so the grid doesn’t jump as cards disappear.
  const pillSort =
    opts.filter === "favorites" ||
    opts.filter === "recent" ||
    opts.filter === "cooked"
      ? opts.filter
      : null;

  if (opts.filter && !pillSort) {
    result = result.filter((r) =>
      r.tags.some((t) => t.toLowerCase() === opts.filter!.toLowerCase())
    );
  }

  if (tokens.length) {
    result = result.filter((r) => recipeMatchesTokens(r, tokens));
  }

  const librarySort = opts.sort ?? "recently_added";
  const sorted = [...result];
  sorted.sort((a, b) => {
    if (pillSort === "favorites") {
      const fav = Number(b.is_favorite) - Number(a.is_favorite);
      if (fav) return fav;
    } else if (pillSort === "recent") {
      const ao = a.last_opened_at;
      const bo = b.last_opened_at;
      if (ao || bo) {
        if (!ao) return 1;
        if (!bo) return -1;
        const byOpened = bo.localeCompare(ao);
        if (byOpened) return byOpened;
      }
    } else if (pillSort === "cooked") {
      const cooked = Number(Boolean(b.cooked)) - Number(Boolean(a.cooked));
      if (cooked) return cooked;
      const rating = (b.rating ?? 0) - (a.rating ?? 0);
      if (rating) return rating;
      const times = (b.times_cooked ?? 0) - (a.times_cooked ?? 0);
      if (times) return times;
    }
    return compareByLibrarySort(a, b, librarySort);
  });

  return sorted;
}

function compareByLibrarySort(
  a: Recipe,
  b: Recipe,
  sort: Preferences["library_sort"]
): number {
  if (sort === "title") return a.title.localeCompare(b.title);
  if (sort === "prep_time") return a.prep_time_minutes - b.prep_time_minutes;
  if (sort === "most_cooked") {
    return (b.times_cooked ?? 0) - (a.times_cooked ?? 0);
  }
  return b.created_at.localeCompare(a.created_at);
}

function tokenizeSearch(query: string): string[] {
  if (!query) return [];
  return query
    .split(/[\s,+/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function tokenVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  if (token.length > 3 && token.endsWith("s")) {
    variants.add(token.slice(0, -1));
  } else if (token.length > 2) {
    variants.add(`${token}s`);
    variants.add(`${token}es`);
  }
  return [...variants];
}

function recipeMatchesTokens(recipe: Recipe, tokens: string[]): boolean {
  const ingredientBlob = recipe.ingredients_normalized
    .flatMap((i) => [i.name, i.search_key])
    .join(" ")
    .toLowerCase();
  const haystack = [
    recipe.title,
    recipe.source_handle ?? "",
    recipe.source_url ?? "",
    ...recipe.tags,
    ingredientBlob,
    ...recipe.steps.map((s) => `${s.action_header} ${s.instruction}`),
  ]
    .join(" ")
    .toLowerCase();

  return tokens.every((token) =>
    tokenVariants(token).some(
      (variant) =>
        haystack.includes(variant) || ingredientBlob.includes(variant)
    )
  );
}
