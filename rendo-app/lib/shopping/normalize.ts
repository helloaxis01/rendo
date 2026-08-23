/** Normalize an ingredient name for shopping-list matching. */

const FILLER =
  /\b(fresh|dried|chopped|minced|sliced|diced|optional|large|small|medium|whole|ground|extra|virgin)\b/gi;

export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
}
