import type { Recipe } from "@/lib/db/types";

const SKIP_KEYS = new Set(["ingredient", "ingredients"]);

/** Assumed on hand so salt and oil don’t block a match. */
const STAPLES = [
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
];

function neededOnHand(total: number): number {
  if (total <= 0) return 1;
  return Math.ceil((total + 1) / 2);
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ingredientKeys(name: string, searchKey?: string): string[] {
  const keys = new Set<string>();
  const search = normalizeKey(searchKey ?? "");
  const full = normalizeKey(name);
  if (search && !SKIP_KEYS.has(search)) keys.add(search);
  if (full && !SKIP_KEYS.has(full)) keys.add(full);
  const last = full.split(" ").filter(Boolean).pop();
  if (last && last.length >= 2 && !SKIP_KEYS.has(last)) keys.add(last);
  return [...keys];
}

function ingredientTokens(name: string, searchKey?: string): Set<string> {
  const tokens = new Set<string>();
  for (const key of ingredientKeys(name, searchKey)) {
    for (const part of key.split(" ").filter(Boolean)) {
      if (part.length >= 2 && !SKIP_KEYS.has(part)) tokens.add(part);
    }
  }
  return tokens;
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

function ingredientHasItem(
  tokens: Set<string>,
  needle: string
): boolean {
  const parts = needle.split(" ").filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) =>
    [...tokens].some((token) => sameFoodWord(token, part))
  );
}

function pantryNeedles(selected: string[]): string[] {
  const needles = new Set<string>();
  for (const item of [...selected, ...STAPLES]) {
    const needle = normalizeKey(item);
    if (needle) needles.add(needle);
  }
  return [...needles];
}

function isStapleName(name: string, searchKey?: string): boolean {
  const tokens = ingredientTokens(name, searchKey);
  return STAPLES.some((staple) =>
    ingredientHasItem(tokens, normalizeKey(staple))
  );
}

/** Split typed pantry text into separate items: "garlic, pasta" or "garlic and pasta". */
export function parseKitchenItems(raw: string): string[] {
  return raw
    .split(/\s*(?:,|&|\/|\band\b)\s*/i)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

export function collectKitchenIngredients(recipes: Recipe[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients_normalized) {
      if (isStapleName(ing.name, ing.search_key)) continue;
      const keys = ingredientKeys(ing.name, ing.search_key);
      const label = (ing.search_key || ing.name.split(",")[0] || ing.name)
        .trim()
        .toLowerCase();
      if (!label || SKIP_KEYS.has(label)) continue;
      const key = keys[0] ?? normalizeKey(label);
      if (!key) continue;
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { label, count: 1 });
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
  const applied = new Set(selected.map((item) => item.toLowerCase()));
  const q = query.trim().toLowerCase();
  if (!q) {
    return pool.filter((name) => !applied.has(name.toLowerCase())).slice(0, 8);
  }
  const prefix: string[] = [];
  const substring: string[] = [];
  for (const name of pool) {
    const key = name.toLowerCase();
    if (!key || applied.has(key)) continue;
    if (key.startsWith(q)) prefix.push(name);
    else if (key.includes(q)) substring.push(name);
  }
  return [...prefix, ...substring].slice(0, 6);
}

export type KitchenFit = {
  covered: number;
  total: number;
  missing: number;
  pantryHits: number;
  canMake: boolean;
};

function recipeLines(recipe: Recipe) {
  return recipe.ingredients_normalized.filter((ing) => {
    const label = normalizeKey(ing.search_key || ing.name);
    return Boolean(label) && !SKIP_KEYS.has(label);
  });
}

export function kitchenRecipeFit(
  recipe: Recipe,
  selected: string[]
): KitchenFit {
  const lines = recipeLines(recipe);
  const total = lines.length;
  if (!selected.length || total === 0) {
    return {
      covered: 0,
      total,
      missing: total,
      pantryHits: 0,
      canMake: false,
    };
  }

  const pantry = pantryNeedles(selected);
  const typed = selected
    .map((item) => normalizeKey(item))
    .filter(Boolean);

  let covered = 0;
  const hitTyped = new Set<string>();
  for (const ing of lines) {
    const tokens = ingredientTokens(ing.name, ing.search_key);
    const onHand = pantry.some((needle) => ingredientHasItem(tokens, needle));
    if (onHand) covered += 1;
    for (const item of typed) {
      if (ingredientHasItem(tokens, item)) hitTyped.add(item);
    }
  }

  const pantryHits = hitTyped.size;
  const missing = total - covered;
  const canMake = pantryHits >= 1 && covered >= neededOnHand(total);

  return { covered, total, missing, pantryHits, canMake };
}

/** How many of the typed pantry items appear in the recipe. */
export function kitchenMatchScore(
  recipe: Recipe,
  selected: string[]
): number {
  return kitchenRecipeFit(recipe, selected).pantryHits;
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
  if (selected.length === 1 && summary.canMake === 0) {
    return `Add 2 or 3 more ingredients. ${selected[0]} alone is in too many recipes to be useful.`;
  }
  if (summary.canMake === 0) {
    return "Nothing you can mostly make yet. Add another ingredient.";
  }
  if (summary.complete === summary.canMake) {
    return summary.canMake === 1
      ? "1 recipe you can make with this."
      : `${summary.canMake} recipes you can make with this.`;
  }
  const make =
    summary.canMake === 1
      ? "1 recipe you can mostly make."
      : `${summary.canMake} recipes you can mostly make.`;
  if (summary.complete === 0) return make;
  const done =
    summary.complete === 1
      ? "1 has everything."
      : `${summary.complete} have everything.`;
  return `${make} ${done}`;
}

/**
 * Recipes you can mostly make: more than half the ingredients on hand,
 * counting pantry staples. Fewest missing first.
 */
export function rankRecipesByKitchen(
  recipes: Recipe[],
  selected: string[]
): Recipe[] {
  if (!selected.length) return recipes;
  const scored = recipes
    .map((recipe) => ({ recipe, fit: kitchenRecipeFit(recipe, selected) }))
    .filter((row) => row.fit.canMake);
  scored.sort((a, b) => {
    if (a.fit.missing !== b.fit.missing) return a.fit.missing - b.fit.missing;
    if (b.fit.covered !== a.fit.covered) return b.fit.covered - a.fit.covered;
    return b.recipe.created_at.localeCompare(a.recipe.created_at);
  });
  return scored.map((row) => row.recipe);
}
