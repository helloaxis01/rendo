import type { Recipe } from "@/lib/db/types";

/** True when a parse is too thin or looks like a stub — do not save it. */
export function isWeakRecipe(recipe: Recipe): boolean {
  if ((recipe.ingredients_normalized?.length ?? 0) < 2) return true;
  if ((recipe.steps?.length ?? 0) < 1) return true;
  const title = recipe.title.trim().toLowerCase();
  if (
    /^(unknown( recipe)?|untitled|n\/a|none|instagram|tiktok|facebook|pinterest|youtube)$/i.test(
      title
    )
  ) {
    return true;
  }
  if (
    /^(www\.)?(instagram|tiktok|facebook|youtube|pinterest)\.com$/i.test(title)
  ) {
    return true;
  }
  const stubby = recipe.ingredients_normalized?.some((ing) =>
    /edit me|primary ingredient \(edit me\)/i.test(ing.name)
  );
  if (stubby) return true;
  return false;
}
