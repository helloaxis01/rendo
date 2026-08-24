import type { Recipe } from "@/lib/db/types";
import {
  extractIngredientName,
  ingredientName,
  isWeakIngredientName,
} from "@/lib/ingredients/ingredient-name";

/** Minimum selected↔recipe ingredient_name overlap to appear in On hand. */
export const MIN_KITCHEN_OVERLAP = 1;

const SKIP = new Set(["ingredient", "ingredients", ""]);

/** Assumed always available — never shown as pantry chips. */
const STAPLES = new Set([
  "salt",
  "pepper",
  "black pepper",
  "kosher salt",
  "sea salt",
  "water",
  "oil",
  "olive oil",
  "vegetable oil",
  "canola oil",
  "cooking spray",
]);

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameFoodWord(token: string, needle: string): boolean {
  if (token === needle) return true;
  if (token.length < 4 || needle.length < 4) return false;
  return (
    token === `${needle}s` ||
    needle === `${token}s` ||
    token === `${needle}es` ||
    needle === `${token}es`
  );
}

/** True when selected pantry item matches this ingredient_name (whole words only). */
export function ingredientNameMatches(
  recipeIngredientName: string,
  selectedItem: string
): boolean {
  const name = normalizeKey(recipeIngredientName);
  const needle = normalizeKey(selectedItem);
  if (!name || !needle || SKIP.has(name) || SKIP.has(needle)) return false;
  if (name === needle) return true;

  const nameTokens = name.split(/\s+/).filter(Boolean);
  const needleTokens = needle.split(/\s+/).filter(Boolean);
  if (!nameTokens.length || !needleTokens.length) return false;

  // Multi-word pantry item: every token must appear as a whole food word.
  return needleTokens.every((part) =>
    nameTokens.some((token) => sameFoodWord(token, part))
  );
}

function isStapleIngredientName(name: string): boolean {
  const key = normalizeKey(name);
  if (!key) return false;
  if (STAPLES.has(key)) return true;
  return [...STAPLES].some((staple) => ingredientNameMatches(key, staple));
}

function recipeIngredientNames(recipe: Recipe): string[] {
  const names: string[] = [];
  for (const ing of recipe.ingredients_normalized) {
    const name = ingredientName(ing);
    if (!name || SKIP.has(name) || isWeakIngredientName(name)) continue;
    names.push(name);
  }
  return names;
}

/** Split typed pantry text into separate items: "garlic, pasta" or "garlic and pasta". */
export function parseKitchenItems(raw: string): string[] {
  return raw
    .split(/\s*(?:,|&|\/|\band\b)\s*/i)
    .map((item) => extractIngredientName(item) || item.trim().replace(/\s+/g, " ").toLowerCase())
    .map((item) => item.trim())
    .filter((item) => item && !isWeakIngredientName(item) && !SKIP.has(item));
}

export function collectKitchenIngredients(recipes: Recipe[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients_normalized) {
      const name = ingredientName(ing);
      if (!name || isStapleIngredientName(name) || isWeakIngredientName(name)) {
        continue;
      }
      const key = normalizeKey(name);
      if (!key || SKIP.has(key)) continue;
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { label: name, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((row) => row.label);
}

export function suggestKitchenIngredients(
  pool: string[],
  query: string,
  selected: string[]
): string[] {
  const applied = new Set(selected.map((item) => normalizeKey(item)));
  const q = query.trim().toLowerCase();
  if (!q) {
    return pool
      .filter((name) => !applied.has(normalizeKey(name)))
      .slice(0, 8);
  }
  const prefix: string[] = [];
  const substring: string[] = [];
  for (const name of pool) {
    const key = name.toLowerCase();
    if (!key || applied.has(normalizeKey(name))) continue;
    if (isWeakIngredientName(name)) continue;
    if (key.startsWith(q)) prefix.push(name);
    else if (key.includes(q)) substring.push(name);
  }
  return [...prefix, ...substring].slice(0, 6);
}

export type KitchenFit = {
  /** How many of the user's selected ingredients appear in the recipe. */
  matched: number;
  /** Size of the user's selection (badge denominator). */
  selectedCount: number;
  /** @deprecated use matched — kept for call sites during transition */
  covered: number;
  /** @deprecated use selectedCount */
  total: number;
  missing: number;
  pantryHits: number;
  canMake: boolean;
};

export function kitchenRecipeFit(
  recipe: Recipe,
  selected: string[],
  minOverlap: number = MIN_KITCHEN_OVERLAP
): KitchenFit {
  const selectedClean = selected
    .map((item) => normalizeKey(extractIngredientName(item) || item))
    .filter((item) => item && !SKIP.has(item) && !isWeakIngredientName(item));
  const names = recipeIngredientNames(recipe);
  const selectedCount = selectedClean.length;

  if (!selectedCount || !names.length) {
    return {
      matched: 0,
      selectedCount,
      covered: 0,
      total: selectedCount,
      missing: selectedCount,
      pantryHits: 0,
      canMake: false,
    };
  }

  const hitSelected = new Set<string>();
  for (const item of selectedClean) {
    if (names.some((name) => ingredientNameMatches(name, item))) {
      hitSelected.add(item);
    }
  }

  const matched = hitSelected.size;
  const canMake = matched >= minOverlap;

  return {
    matched,
    selectedCount,
    covered: matched,
    total: selectedCount,
    missing: selectedCount - matched,
    pantryHits: matched,
    canMake,
  };
}

/** How many of the typed pantry items appear in the recipe. */
export function kitchenMatchScore(
  recipe: Recipe,
  selected: string[]
): number {
  return kitchenRecipeFit(recipe, selected).matched;
}

export function kitchenSummary(
  recipes: Recipe[],
  selected: string[]
): { canMake: number; complete: number } {
  if (!selected.length) return { canMake: 0, complete: 0 };
  let canMake = 0;
  let complete = 0;
  for (const recipe of recipes) {
    const fit = kitchenRecipeFit(recipe, selected);
    if (!fit.canMake) continue;
    canMake += 1;
    if (fit.missing === 0) complete += 1;
  }
  return { canMake, complete };
}

export function kitchenSummaryLine(
  selected: string[],
  summary: { canMake: number; complete: number }
): string | null {
  if (!selected.length) return null;
  if (summary.canMake === 0) {
    return "No recipes match what you have on hand";
  }
  if (summary.complete === summary.canMake) {
    return summary.canMake === 1
      ? "1 recipe uses what you picked."
      : `${summary.canMake} recipes use what you picked.`;
  }
  const make =
    summary.canMake === 1
      ? "1 recipe overlaps."
      : `${summary.canMake} recipes overlap.`;
  if (summary.complete === 0) return make;
  const done =
    summary.complete === 1
      ? "1 uses all of them."
      : `${summary.complete} use all of them.`;
  return `${make} ${done}`;
}

/**
 * On hand results: only recipes with real ingredient_name overlap.
 * Sorted by most matched selected ingredients, then fewest missing.
 */
export function rankRecipesByKitchen(
  recipes: Recipe[],
  selected: string[],
  minOverlap: number = MIN_KITCHEN_OVERLAP
): Recipe[] {
  if (!selected.length) return recipes;
  const scored = recipes
    .map((recipe) => ({
      recipe,
      fit: kitchenRecipeFit(recipe, selected, minOverlap),
    }))
    .filter((row) => row.fit.canMake);
  scored.sort((a, b) => {
    if (b.fit.matched !== a.fit.matched) return b.fit.matched - a.fit.matched;
    if (a.fit.missing !== b.fit.missing) return a.fit.missing - b.fit.missing;
    return b.recipe.created_at.localeCompare(a.recipe.created_at);
  });
  return scored.map((row) => row.recipe);
}
