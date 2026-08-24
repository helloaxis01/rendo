/**
 * Canonical food noun for matching (pantry / On hand / shopping).
 * `search_key` in the DB is this value; `name` stays the display residual.
 */

const PREP_WORDS = new Set([
  "chopped",
  "minced",
  "sliced",
  "diced",
  "grated",
  "crushed",
  "peeled",
  "halved",
  "quartered",
  "cubed",
  "julienned",
  "shredded",
  "torn",
  "crumbled",
  "softened",
  "melted",
  "room",
  "temperature",
  "finely",
  "roughly",
  "thinly",
  "coarsely",
  "freshly",
  "lightly",
  "divided",
  "optional",
  "plus",
  "more",
  "extra",
  "serving",
  "garnish",
  "taste",
  "needed",
  "desired",
  "trimmed",
  "seeded",
  "deseeded",
  "pitted",
  "stemmed",
  "cored",
  "drained",
  "rinsed",
  "patted",
  "dry",
  "dried",
  "fresh",
  "frozen",
  "canned",
  "jarred",
  "cooked",
  "raw",
  "whole",
  "ground",
  "smoked",
  "toasted",
  "roasted",
  "unsalted",
  "salted",
  "sweetened",
  "unsweetened",
  "packed",
  "loose",
  "heaping",
  "scant",
  "large",
  "small",
  "medium",
  "big",
  "tiny",
  "ripe",
  "firm",
  "soft",
  "boneless",
  "skinless",
  "about",
  "around",
  "approximately",
  "preferably",
  "such",
  "as",
  "and",
  "or",
  "to",
  "for",
  "with",
  "without",
  "into",
  "cut",
  "pieces",
  "piece",
  "strips",
  "wedges",
  "chunks",
  "leaves",
  "sprigs",
  "bunch",
  "handful",
  "knob",
  "splash",
  "drizzle",
  "dash",
  "pinch",
]);

/** Measure words often left in the name residual. */
const UNIT_WORDS = new Set([
  "cup",
  "cups",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "g",
  "gram",
  "grams",
  "kg",
  "ml",
  "l",
  "liter",
  "liters",
  "clove",
  "cloves",
  "can",
  "cans",
  "stalk",
  "stalks",
  "stick",
  "sticks",
  "head",
  "heads",
  "slice",
  "slices",
  "package",
  "packages",
  "pkg",
  "bunch",
  "bunches",
  "sprig",
  "sprigs",
  "leaf",
  "leaves",
  "inch",
  "inches",
  "cm",
  "pint",
  "pints",
  "quart",
  "quarts",
]);

/** Alone these are prep/sauce fragments, not pantry chips. */
const WEAK_ALONE = new Set([
  "sauce",
  "dressing",
  "mixture",
  "mix",
  "paste",
  "topping",
  "filling",
  "garnish",
  "marinade",
  "rub",
  "glaze",
  "broth",
  "stock",
  "base",
  "liquid",
  "ingredient",
  "ingredients",
]);

const SKIP = new Set(["ingredient", "ingredients", ""]);

export function isWeakIngredientName(name: string): boolean {
  const tokens = normalizeTokens(name);
  if (!tokens.length) return true;
  if (tokens.every((t) => PREP_WORDS.has(t) || UNIT_WORDS.has(t))) return true;
  if (tokens.length === 1 && WEAK_ALONE.has(tokens[0])) return true;
  return false;
}

function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Pull the core food noun from a display / residual ingredient string.
 * "3 garlic cloves, finely chopped" → "garlic"
 * "ripe Hass avocado (or 2 small)" → "hass avocado"
 * "(finely chopped)" → ""
 */
export function extractIngredientName(raw: string): string {
  let text = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text) return "";

  // Drop parenthetical asides entirely.
  text = text.replace(/\([^)]*\)/g, " ");
  // Keep the food phrase before prep lists / alternatives.
  text = text.split(/\s*(?:,|;|\/|\bor\b|\bfor\b)\s*/)[0] ?? text;
  // Leading amounts / fractions left on the residual.
  text = text.replace(
    /^(?:[\d¼½¾⅓⅔]+\s*(?:\/\s*[\d¼½¾⅓⅔]+)?\s*)+/g,
    ""
  );
  text = text.replace(/^[\d./\s-]+/, "");

  const kept = normalizeTokens(text).filter(
    (token) => !PREP_WORDS.has(token) && !UNIT_WORDS.has(token)
  );

  const name = kept.join(" ").trim();
  if (!name || SKIP.has(name) || isWeakIngredientName(name)) return "";
  return name;
}

/** Resolve the noun used for matching — never re-parse display for callers. */
export function ingredientName(ing: {
  name: string;
  search_key?: string | null;
}): string {
  const fromKey = extractIngredientName(ing.search_key ?? "");
  const fromName = extractIngredientName(ing.name);

  // Prefer a clean stored search_key (aliases like spaghetti → pasta).
  if (fromKey && !isWeakIngredientName(fromKey)) return fromKey;
  if (fromName && !isWeakIngredientName(fromName)) return fromName;
  return "";
}

/** Value to persist on `search_key` when writing/updating an ingredient. */
export function resolveSearchKey(
  displayName: string,
  explicitSearchKey?: string | null
): string {
  const fromExplicit = explicitSearchKey
    ? extractIngredientName(explicitSearchKey)
    : "";
  if (fromExplicit && !isWeakIngredientName(fromExplicit)) return fromExplicit;
  const fromName = extractIngredientName(displayName);
  if (fromName) return fromName;
  // Last resort: cleaned explicit even if weak was all we had — avoid "chopped".
  if (fromExplicit) return fromExplicit;
  return "ingredient";
}
