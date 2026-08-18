import type { Recipe } from "@/lib/db/types";

export const SHELF_CAP = 12;
export const SHELF_MIN = 3;
export const WEEKNIGHT_MAX_MINUTES = 30;

export type LibraryShelf = {
  id: "uncooked" | "cooked-month" | "weeknight";
  label: string;
  recipes: Recipe[];
};

function isUncooked(recipe: Recipe): boolean {
  if (recipe.cooked) return false;
  if ((recipe.times_cooked ?? 0) > 0) return false;
  if (recipe.last_cooked_at) return false;
  return true;
}

function isInCalendarMonth(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const cookedAt = new Date(iso);
  if (Number.isNaN(cookedAt.getTime())) return false;
  return (
    cookedAt.getFullYear() === now.getFullYear() &&
    cookedAt.getMonth() === now.getMonth()
  );
}

function capIfUseful(recipes: Recipe[]): Recipe[] {
  if (recipes.length < SHELF_MIN) return [];
  return recipes.slice(0, SHELF_CAP);
}

/** Oldest saves first — the ones most likely to be forgotten. */
export function uncookedShelfRecipes(recipes: Recipe[]): Recipe[] {
  const next = recipes.filter(isUncooked).sort((a, b) => {
    const byCreated = a.created_at.localeCompare(b.created_at);
    if (byCreated) return byCreated;
    return a.title.localeCompare(b.title);
  });
  return capIfUseful(next);
}

/** Marked cooked in the current local calendar month, newest first. */
export function cookedThisMonthRecipes(
  recipes: Recipe[],
  now = new Date()
): Recipe[] {
  const next = recipes
    .filter(
      (recipe) =>
        Boolean(recipe.cooked || (recipe.times_cooked ?? 0) > 0) &&
        isInCalendarMonth(recipe.last_cooked_at, now)
    )
    .sort((a, b) => {
      const byCooked = (b.last_cooked_at ?? "").localeCompare(
        a.last_cooked_at ?? ""
      );
      if (byCooked) return byCooked;
      return a.title.localeCompare(b.title);
    });
  return capIfUseful(next);
}

/**
 * Only uses extracted cook_time_minutes. Hidden when that field is too
 * sparsely populated for a useful row.
 */
export function quickWeeknightRecipes(recipes: Recipe[]): Recipe[] {
  const next = recipes
    .filter((recipe) => {
      const minutes = recipe.cook_time_minutes;
      return minutes != null && minutes > 0 && minutes <= WEEKNIGHT_MAX_MINUTES;
    })
    .sort((a, b) => {
      const byTime =
        (a.cook_time_minutes ?? WEEKNIGHT_MAX_MINUTES) -
        (b.cook_time_minutes ?? WEEKNIGHT_MAX_MINUTES);
      if (byTime) return byTime;
      return a.title.localeCompare(b.title);
    });
  return capIfUseful(next);
}

export function libraryShelves(
  recipes: Recipe[],
  now = new Date()
): LibraryShelf[] {
  const shelves: LibraryShelf[] = [
    {
      id: "uncooked",
      label: "Saved, Not Cooked Yet",
      recipes: uncookedShelfRecipes(recipes),
    },
    {
      id: "cooked-month",
      label: "Cooked This Month",
      recipes: cookedThisMonthRecipes(recipes, now),
    },
    {
      id: "weeknight",
      label: "Quick Weeknight",
      recipes: quickWeeknightRecipes(recipes),
    },
  ];
  return shelves.filter((shelf) => shelf.recipes.length >= SHELF_MIN);
}
