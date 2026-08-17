import type { Recipe } from "@/lib/db/types";

function isSocialShellTitle(title: string): boolean {
  const trimmed = title.trim().toLowerCase();
  return (
    /^(instagram|tiktok|facebook|pinterest|youtube)$/i.test(trimmed) ||
    /^(www\.)?(instagram|tiktok|facebook|youtube|pinterest)\.com$/i.test(trimmed)
  );
}

function hasStubIngredients(recipe: Recipe): boolean {
  return Boolean(
    recipe.ingredients_normalized?.some((ing) =>
      /edit me|primary ingredient \(edit me\)/i.test(ing.name)
    )
  );
}

/** True when a parse is too thin or looks like a stub — do not save it. */
export function isWeakRecipe(
  recipe: Recipe,
  options?: { fromMedia?: boolean }
): boolean {
  if (hasStubIngredients(recipe)) return true;
  if (isSocialShellTitle(recipe.title)) return true;

  const ings = recipe.ingredients_normalized?.length ?? 0;
  const steps = recipe.steps?.length ?? 0;

  if (options?.fromMedia) {
    // Split photos often have only ingredients or only steps. Keep either.
    return ings < 2 && steps < 2 && !(ings >= 1 && steps >= 1);
  }

  if (ings < 2) return true;
  if (steps < 1) return true;
  return false;
}
