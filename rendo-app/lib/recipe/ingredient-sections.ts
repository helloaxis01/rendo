import type { Ingredient, Recipe } from "@/lib/db/types";
import { ingredientName } from "@/lib/ingredients/ingredient-name";

export type IngredientSectionGroup = {
  section: string | null;
  items: Ingredient[];
};

/** Preserve ingredient order; split when section changes. */
export function groupIngredientsBySection(
  ingredients: Ingredient[]
): IngredientSectionGroup[] {
  const groups: IngredientSectionGroup[] = [];
  for (const ing of ingredients) {
    const section = ing.section?.trim() || null;
    const last = groups[groups.length - 1];
    if (!last || last.section !== section) {
      groups.push({ section, items: [ing] });
      continue;
    }
    last.items.push(ing);
  }
  return groups;
}

export function cleanIngredientSection(
  value: string | null | undefined
): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim().replace(/:+$/, "");
  if (!text || text.length > 48) return null;
  return text;
}

function pantryKey(ing: Ingredient): string {
  return ingredientName(ing);
}

export function recipeHasIngredientSections(recipe: Recipe): boolean {
  return recipe.ingredients_normalized.some((ing) =>
    Boolean(ing.section?.trim())
  );
}

export function hasDuplicateIngredientKeys(ingredients: Ingredient[]): boolean {
  const counts = new Map<string, number>();
  for (const ing of ingredients) {
    const key = pantryKey(ing);
    if (key.length < 2) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 2);
}

const COMPONENT_HINT =
  /\bfor the\b|\b(marinade|dressing|vinaigrette|salsa|rub|glaze|topping)\b/i;

/** Flat lists that almost certainly lost group headings. */
export function needsIngredientSections(recipe: Recipe): boolean {
  const ingredients = recipe.ingredients_normalized ?? [];
  if (ingredients.length < 4) return false;
  if (recipeHasIngredientSections(recipe)) return false;
  if (hasDuplicateIngredientKeys(ingredients)) return true;
  if (ingredients.length < 6) return false;
  const method = (recipe.steps ?? [])
    .map((step) => `${step.action_header} ${step.instruction}`)
    .join(" ");
  return COMPONENT_HINT.test(method);
}

export function carryIngredientChecks(
  previous: Ingredient[],
  next: Ingredient[]
): Ingredient[] {
  const unused = [...previous];
  return next.map((ing) => {
    const byId = unused.findIndex((row) => row.id === ing.id);
    const index =
      byId >= 0
        ? byId
        : unused.findIndex(
            (row) =>
              row.search_key === ing.search_key &&
              row.name.toLowerCase() === ing.name.toLowerCase()
          );
    const matched = index >= 0 ? unused.splice(index, 1)[0] : null;
    return { ...ing, checked: matched?.checked ?? false };
  });
}

export function applyAssignedSections(
  ingredients: Ingredient[],
  sections: Array<{ id?: string; section: string | null }>
): Ingredient[] | null {
  if (sections.length !== ingredients.length) return null;
  const next = ingredients.map((ing, index) => {
    const assigned =
      sections.find((row) => row.id && row.id === ing.id) ?? sections[index];
    return {
      ...ing,
      section: cleanIngredientSection(assigned?.section),
    };
  });
  if (!next.some((ing) => ing.section)) return null;
  return next;
}

/** Keep a URL reimport only when it actually restores groups and enough lines. */
export function acceptReimportedIngredients(
  current: Ingredient[],
  incoming: Ingredient[]
): Ingredient[] | null {
  if (!incoming.some((ing) => ing.section?.trim())) return null;
  const floor = Math.max(3, Math.floor(current.length * 0.6));
  if (incoming.length < floor) return null;
  return carryIngredientChecks(
    current,
    incoming.map((ing, index) => ({
      ...ing,
      id: ing.id?.trim() || `ing_${index + 1}`,
      section: cleanIngredientSection(ing.section),
    }))
  );
}
