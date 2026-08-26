import type { Recipe } from "@/lib/db/types";
import { groupIngredientsBySection } from "@/lib/recipe/ingredient-sections";
import {
  formatIngredientLine,
  scaleAmount,
  type UnitSystem,
} from "@/lib/units";

export type RecipePrintContent = {
  title: string;
  meta: string[];
  source: string | null;
  ingredientGroups: Array<{
    section: string | null;
    items: string[];
  }>;
  steps: Array<{ number: number; instruction: string }>;
  footer: string;
};

export const RECIPE_PRINT_LABELS = {
  ingredients: "Ingredients",
  directions: "Directions",
} as const;

function recipeSource(recipe: Recipe): string | null {
  if (recipe.source_handle) return recipe.source_handle;
  if (!recipe.source_url) return null;
  try {
    return new URL(recipe.source_url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function buildRecipePrintContent(
  recipe: Recipe,
  servings: number,
  unitSystem: UnitSystem
): RecipePrintContent {
  const source = recipeSource(recipe);
  const meta = [
    `${servings} serving${servings === 1 ? "" : "s"}`,
    `${recipe.prep_time_minutes} min`,
  ];
  if (source) meta.push(source);

  const ingredientGroups = groupIngredientsBySection(
    recipe.ingredients_normalized
  ).map((group) => ({
    section: group.section,
    items: group.items.map((ing) => {
      const amount = scaleAmount(ing.amount, recipe.servings_base, servings);
      return formatIngredientLine(amount, ing.unit, ing.name, unitSystem);
    }),
  }));

  const printedAt = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return {
    title: recipe.title,
    meta,
    source,
    ingredientGroups,
    steps: recipe.steps.map((step) => ({
      number: step.step_number,
      instruction: step.instruction,
    })),
    footer: recipe.source_url ?? `Printed ${printedAt} · rendorecipes.netlify.app`,
  };
}

export function formatRecipePlainText(
  recipe: Recipe,
  servings: number,
  unitSystem: UnitSystem
): string {
  const content = buildRecipePrintContent(recipe, servings, unitSystem);
  const lines: string[] = [content.title, content.meta.join(" · "), ""];

  for (const group of content.ingredientGroups) {
    lines.push(group.section ? `${group.section.toUpperCase()}` : "INGREDIENTS");
    for (const item of group.items) {
      lines.push(`☐ ${item}`);
    }
    lines.push("");
  }

  lines.push("DIRECTIONS");
  for (const step of content.steps) {
    lines.push(`${step.number}. ${step.instruction}`);
  }
  lines.push("", content.footer);
  return lines.join("\n");
}

export function recipePdfFilename(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return `${base || "recipe"}.pdf`;
}
