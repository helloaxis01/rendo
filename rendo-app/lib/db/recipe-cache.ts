import type { Recipe } from "@/lib/db/types";

const cache = new Map<string, Recipe>();

export function rememberRecipe(recipe: Recipe) {
  cache.set(recipe.id, recipe);
}

export function rememberRecipes(recipes: Recipe[]) {
  for (const recipe of recipes) cache.set(recipe.id, recipe);
}

export function peekRecipe(id: string): Recipe | null {
  return cache.get(id) ?? null;
}

export function forgetRecipe(id: string) {
  cache.delete(id);
}
