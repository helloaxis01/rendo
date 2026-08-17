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

function lineKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Photo sessions are one recipe across ordered frames.
 * If Gemini still emits one object per page, stitch them and drop overlap.
 */
export function stitchVisionRecipes(recipes: Recipe[]): Recipe[] {
  if (recipes.length <= 1) return recipes;
  const title =
    recipes.find(
      (recipe) =>
        recipe.title.trim() && !/^unknown recipe$/i.test(recipe.title.trim())
    )?.title ?? recipes[0].title;

  const seenIng = new Set<string>();
  const ingredients: Recipe["ingredients_normalized"] = [];
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients_normalized ?? []) {
      const key = lineKey(ing.name);
      if (!key || seenIng.has(key)) continue;
      seenIng.add(key);
      ingredients.push({ ...ing, id: `ing_${ingredients.length + 1}` });
    }
  }

  const seenStep = new Set<string>();
  const steps: Recipe["steps"] = [];
  for (const recipe of recipes) {
    for (const step of recipe.steps ?? []) {
      const key = lineKey(step.instruction);
      if (!key || seenStep.has(key)) continue;
      seenStep.add(key);
      steps.push({ ...step, step_number: steps.length + 1 });
    }
  }

  return [
    {
      ...recipes[0],
      title,
      ingredients_normalized: ingredients,
      steps,
    },
  ];
}
