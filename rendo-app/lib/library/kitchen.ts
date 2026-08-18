import type { Recipe } from "@/lib/db/types";

const SKIP_KEYS = new Set(["ingredient", "ingredients"]);

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

export function collectKitchenIngredients(recipes: Recipe[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients_normalized) {
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

export function kitchenMatchScore(
  recipe: Recipe,
  selected: string[]
): number {
  if (!selected.length) return 0;
  const haystack = recipe.ingredients_normalized
    .flatMap((ing) => ingredientKeys(ing.name, ing.search_key))
    .join(" ");
  let score = 0;
  for (const item of selected) {
    const needle = normalizeKey(item);
    if (!needle) continue;
    if (
      haystack.includes(needle) ||
      haystack.split(" ").some((token) => token === needle || token.startsWith(needle))
    ) {
      score += 1;
    }
  }
  return score;
}

/** Keep partial matches; rank more hits first. Hide recipes with zero hits. */
export function rankRecipesByKitchen(
  recipes: Recipe[],
  selected: string[]
): Recipe[] {
  if (!selected.length) return recipes;
  const scored = recipes
    .map((recipe) => ({ recipe, score: kitchenMatchScore(recipe, selected) }))
    .filter((row) => row.score > 0);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.recipe.created_at.localeCompare(a.recipe.created_at);
  });
  return scored.map((row) => row.recipe);
}
