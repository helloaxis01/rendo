import type { Ingredient } from "@/lib/db/types";

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
