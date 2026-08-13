/** Map a recipe’s title / tags / ingredients to a food-cover palette. No model call. */

export type FoodCoverId =
  | "avocado"
  | "basil"
  | "beet"
  | "berry"
  | "bread"
  | "chocolate"
  | "lemon"
  | "olive"
  | "peach"
  | "pepper"
  | "tomato"
  | "yolk";

export type TypeCoverHint = {
  title?: string;
  tags?: string[];
  ingredients?: string[];
};

type Term = {
  id: FoodCoverId;
  weight: number;
  pattern: RegExp;
};

const TITLE = 4;
const TAG = 2;
const INGREDIENT = 1;
const MIN_SCORE = 5;

/** Pantry noise — stripped from ingredient text only, not titles. */
const PANTRY =
  /\b(extra[- ]virgin\s+)?(olive|vegetable|canola|avocado|grapeseed|sesame|coconut)\s+oil\b|\b(kosher|sea|table)?\s*salt\b|\b(black|white|ground)\s+peppers?\b|\b(unsalted\s+)?butter\b|\b(all[- ]purpose\s+)?flour\b|\b(granulated|brown|white|cane)?\s*sugars?\b|\b(water|ice|garlic|shallots?|onions?|yellow onion|white onion|cooking spray)\b/gi;

const TERMS: Term[] = (
  [
    ["tomato", 14, "shakshuka|shakshouka|chakchouka"],
    ["tomato", 10, "marinara|arrabbiata|puttanesca|pomodoro|gazpacho|caprese"],
    ["tomato", 8, "vodka sauce|salsa roja|sun[- ]dried tomato"],
    ["tomato", 6, "tomatoes|tomato|passata|pomodori"],
    ["pepper", 10, "harissa|gochujang|romesco|nduja|ajvar"],
    ["pepper", 7, "sriracha|calabrian|aleppo|cayenne|buffalo"],
    ["pepper", 5, "chil(?:i|li|e)s?|red pepper flakes?"],
    ["lemon", 12, "lemon|limoncello|yuzu|citron"],
    ["lemon", 8, "lime|citrus|calamansi|lemonade"],
    ["basil", 12, "pesto|chimichurri|gremolata|salsa verde|green goddess"],
    ["basil", 8, "matcha|spinach|kale|mint|basil|cilantro|parsley"],
    ["basil", 5, "herbs?|herbaceous"],
    ["avocado", 12, "guacamole|avocado|aguacate"],
    ["beet", 12, "beetroot|borscht|beets?"],
    ["berry", 10, "blueberr(?:y|ies)|blackberr(?:y|ies)|raspberr(?:y|ies)|strawberr(?:y|ies)"],
    ["berry", 8, "cranberr(?:y|ies)|acai|berries|berry"],
    ["chocolate", 12, "chocolate|cocoa|brownie|tiramisu|mocha"],
    ["chocolate", 7, "espresso|coffee"],
    ["olive", 10, "tapenade|kalamata|castelvetrano|ni[cç]oise"],
    ["olive", 7, "olives?"],
    ["peach", 10, "peach|nectarine|apricot|mango|papaya|cantaloupe"],
    ["peach", 7, "pumpkin|butternut|sweet potato|carrot"],
    ["peach", 6, "salmon|shrimp|prawns?"],
    ["yolk", 10, "carbonara|hollandaise|aioli|custard|saffron|turmeric"],
    ["yolk", 7, "curry|frittata|omelettes?|omelets?|scrambled"],
    ["yolk", 4, "risotto|polenta|mac and cheese"],
    ["bread", 8, "focaccia|sourdough|baguette|pancake|waffle"],
    ["bread", 6, "oatmeal|granola|muffin|biscuit|toast|bread|oats"],
    ["bread", 5, "sandwich"],
  ] as Array<[FoodCoverId, number, string]>
).map(([id, weight, source]) => ({
  id,
  weight,
  pattern: new RegExp(`\\b(?:${source})\\b`, "i"),
}));

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function fieldScore(text: string, multiplier: number): Map<FoodCoverId, number> {
  const scores = new Map<FoodCoverId, number>();
  if (!text) return scores;
  for (const term of TERMS) {
    if (!term.pattern.test(text)) continue;
    scores.set(term.id, (scores.get(term.id) ?? 0) + term.weight * multiplier);
  }
  return scores;
}

function addScores(into: Map<FoodCoverId, number>, from: Map<FoodCoverId, number>) {
  for (const [id, score] of from) {
    into.set(id, (into.get(id) ?? 0) + score);
  }
}

export function typeCoverHintFromRecipe(recipe: {
  title: string;
  tags?: string[];
  ingredients_normalized?: Array<{ name: string }>;
}): TypeCoverHint {
  return {
    title: recipe.title,
    tags: recipe.tags,
    ingredients: recipe.ingredients_normalized?.map((item) => item.name) ?? [],
  };
}

/** Best palette for this dish, or null when nothing distinctive matched. */
export function paletteIdForHint(hint?: TypeCoverHint | null): FoodCoverId | null {
  if (!hint) return null;

  const title = normalize(hint.title ?? "");
  const tags = normalize((hint.tags ?? []).join(" "));
  const ingredients = normalize(
    (hint.ingredients ?? []).join(" ").replace(PANTRY, " ")
  );

  const totals = new Map<FoodCoverId, number>();
  addScores(totals, fieldScore(title, TITLE));
  addScores(totals, fieldScore(tags, TAG));
  addScores(totals, fieldScore(ingredients, INGREDIENT));

  let best: FoodCoverId | null = null;
  let bestScore = 0;
  for (const [id, score] of totals) {
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return bestScore >= MIN_SCORE ? best : null;
}
