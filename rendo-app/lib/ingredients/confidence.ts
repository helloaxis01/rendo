import type { Ingredient, Recipe } from "@/lib/db/types";

/** Vision scores below this are treated as ambiguous and need user review. */
export const CONFIDENCE_REVIEW_THRESHOLD = 0.75;

export function isLowConfidence(
  ingredient: Pick<Ingredient, "confidence_score">
): boolean {
  const score = ingredient.confidence_score;
  return score != null && Number.isFinite(score) && score < CONFIDENCE_REVIEW_THRESHOLD;
}

export function countLowConfidenceIngredients(recipe: Recipe): number {
  return recipe.ingredients_normalized.filter(isLowConfidence).length;
}

export function recipesNeedConfidenceReview(recipes: Recipe[]): boolean {
  return recipes.some((recipe) => countLowConfidenceIngredients(recipe) > 0);
}

/** Mark an ingredient as user-verified (clears the review highlight). */
export function confirmIngredientConfidence(ingredient: Ingredient): Ingredient {
  return {
    ...ingredient,
    confidence_score: ingredient.confidence_score == null ? null : 1,
  };
}

export function confirmRecipeLowConfidence(recipe: Recipe): Recipe {
  return {
    ...recipe,
    ingredients_normalized: recipe.ingredients_normalized.map((ing) =>
      isLowConfidence(ing) ? confirmIngredientConfidence(ing) : ing
    ),
  };
}

export function patchIngredientInRecipes(
  recipes: Recipe[],
  recipeId: string,
  ingredientId: string,
  patch: Partial<Ingredient>
): Recipe[] {
  return recipes.map((recipe) => {
    if (recipe.id !== recipeId) return recipe;
    return {
      ...recipe,
      ingredients_normalized: recipe.ingredients_normalized.map((ing) =>
        ing.id === ingredientId ? { ...ing, ...patch } : ing
      ),
    };
  });
}
