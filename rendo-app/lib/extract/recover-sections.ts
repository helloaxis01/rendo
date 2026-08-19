import { extractRecipes, assignIngredientSections } from "@/lib/extract/gemini";
import { isSocialPostUrl } from "@/lib/extract/instagram";
import {
  acceptReimportedIngredients,
  applyAssignedSections,
} from "@/lib/recipe/ingredient-sections";
import type { Ingredient, RecipeStep } from "@/lib/db/types";

function canReimportUrl(url: string | null | undefined): boolean {
  const raw = url?.trim() ?? "";
  if (!/^https?:\/\//i.test(raw)) return false;
  if (isSocialPostUrl(raw)) return false;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "example.com" || host.endsWith(".example.com")) return false;
  } catch {
    return false;
  }
  return true;
}

function titleOverlap(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const right = b.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  if (!left || !right) return false;
  return left.includes(right.slice(0, 12)) || right.includes(left.slice(0, 12));
}

/**
 * Restore ingredient group headings. Prefers a fresh URL extract, then
 * Gemini headings on the saved lines.
 */
export async function recoverIngredientSections(input: {
  title: string;
  source_url: string | null;
  ingredients_normalized: Ingredient[];
  steps: RecipeStep[];
}): Promise<Ingredient[] | null> {
  if (canReimportUrl(input.source_url)) {
    try {
      const extracted = await extractRecipes({
        type: "url",
        payload: input.source_url!,
      });
      const candidates = extracted.recipes.filter((recipe) =>
        recipe.ingredients_normalized.some((ing) => ing.section?.trim())
      );
      const match =
        candidates.find((recipe) => titleOverlap(recipe.title, input.title)) ??
        candidates[0];
      const accepted = match
        ? acceptReimportedIngredients(
            input.ingredients_normalized,
            match.ingredients_normalized
          )
        : null;
      if (accepted) return accepted;
    } catch {
      // Fall through to heading assignment on the saved list.
    }
  }

  const assigned = await assignIngredientSections({
    title: input.title,
    ingredients_normalized: input.ingredients_normalized,
    steps: input.steps,
  });
  if (!assigned) return null;
  return applyAssignedSections(input.ingredients_normalized, assigned);
}
