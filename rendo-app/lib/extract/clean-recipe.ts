/** Drop site chrome so imports keep only foods and cooking steps. */

import { extractIngredientName, ingredientName } from "@/lib/ingredients/ingredient-name";

const CHROME_LINE =
  /^(start(\s+your)?\s+(free\s+)?trial|begin(\s+your)?\s+trial|previous(\s*\/\s*|\s+)?next|previous|next|privacy(\s+policy)?|terms(\s+of\s+(use|service|service))?|privacy\s*[&+]?\s*terms|cookie(s|\s+policy)?|subscribe( now)?|sign\s*up|log\s*in|sign\s*in|skip to( content| recipe)?|jump to recipe|leave a comment|related posts|you may also like|pin it|share( this)?|print( recipe)?|search|home|about|contact|shop|follow (us|me)|enable javascript|all rights reserved|copyright|newsletter|comments?|save recipe|rate this|load more|read more|continue reading)$/i;

const CHROME_PHRASE =
  /\b(start(\s+your)?\s+trial|free trial|privacy policy|terms of (use|service)|cookie policy|all rights reserved|subscribe to|newsletter|leave a comment|related (posts|recipes)|skip to content|as an amazon associate|affiliate)\b/i;

const COOK_MEASURE =
  /\b(\d|¼|½|¾|⅓|⅔|cup|cups|tbsp|tsp|tablespoon|teaspoon|oz|ounce|gram|ml|clove|pinch|dash|to taste|salt|pepper|oil|flour|egg|butter|sugar|garlic|onion)\b/i;

const PREP_ONLY_FRAGMENT =
  /^(or to taste|to taste|peeled|halved|sliced|diced|minced|chopped|grated|crushed|optional|plus more|for serving|thinly sliced|roughly chopped|cut\b.*)$/i;

const METADATA_STEP =
  /^(title|description|total time|prep time|cook time|yield|servings?|cuisine|category|keywords?|author|date published|recipe yield)\s*:/i;

export function isChromeLine(text: string): boolean {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return true;
  if (CHROME_LINE.test(line)) return true;
  if (CHROME_PHRASE.test(line) && !COOK_MEASURE.test(line)) return true;
  if (/^©/.test(line)) return true;
  if (/@?\s*20\d{2}\b/.test(line) && line.length < 80 && !COOK_MEASURE.test(line)) {
    return true;
  }
  if (/^(previous|next)(\b|\s|\/)/i.test(line) && line.length < 48) return true;
  return false;
}

export function looksLikeWebpageChrome(text: string): boolean {
  const sample = text.slice(0, 8000);
  let hits = 0;
  if (/\bprivacy\b/i.test(sample)) hits += 1;
  if (/\bsubscribe\b/i.test(sample)) hits += 1;
  if (/\bcookie/i.test(sample)) hits += 1;
  if (/\bstart(\s+your)?\s+trial\b/i.test(sample)) hits += 1;
  if (/\bprevious\b/i.test(sample) && /\bnext\b/i.test(sample)) hits += 1;
  if (/\b(leave a comment|related posts|skip to content)\b/i.test(sample)) {
    hits += 1;
  }
  return hits >= 2 || text.length > 6000;
}

/** Prep fragments that blogs often put on their own recipeIngredient row. */
export function isIngredientContinuation(text: string): boolean {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return false;
  if (/^[\d¼½¾⅓⅔]/.test(line) || /^\d+\s*\/\s*\d+/.test(line)) return false;
  if (PREP_ONLY_FRAGMENT.test(line)) return true;
  if (/^(or|and|plus)\b/i.test(line) && line.length <= 70) return true;
  // Parenthetical weight/size notes, or prep instructions starting lowercase.
  if (/^\(.*\)$/.test(line) && line.length <= 70) return true;
  if (
    /^[a-z]/.test(line) &&
    line.length <= 70 &&
    /\b(cut|sliced|diced|minced|chopped|peeled|halved|grated|crushed|thinly|roughly|about|around|optional)\b/i.test(
      line
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Merge broken schema.org ingredient rows back onto the previous food line.
 * e.g. "2 garlic cloves" + "peeled" + "halved" → one ingredient.
 */
export function coalesceIngredientLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (out.length && isIngredientContinuation(line)) {
      const prev = out[out.length - 1];
      const joiner =
        /,$/.test(prev) || /^(or|and|plus)\b/i.test(line) ? " " : ", ";
      out[out.length - 1] = `${prev}${joiner}${line}`
        .replace(/\s+/g, " ")
        .trim();
      continue;
    }
    out.push(line);
  }
  return out;
}

export function looksLikeIngredientLine(text: string): boolean {
  if (isChromeLine(text)) return false;
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length < 2 || line.length > 120) return false;
  if (/^(ingredients?|directions?|method|steps?|instructions?)$/i.test(line)) {
    return false;
  }
  if (PREP_ONLY_FRAGMENT.test(line)) return false;
  if (isIngredientContinuation(line) && !COOK_MEASURE.test(line)) return false;
  if (
    /\b(click|subscribe|follow|share|comment|newsletter|download|app store)\b/i.test(
      line
    ) &&
    !COOK_MEASURE.test(line)
  ) {
    return false;
  }
  return true;
}

export function looksLikeStepLine(text: string): boolean {
  if (isChromeLine(text)) return false;
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length < 10) return false;
  if (METADATA_STEP.test(line)) return false;
  if (/^title:\s*/i.test(line) && /\bdescription:\s*/i.test(line)) return false;
  if (/\bPT\d+[HMS0-9]*\b/i.test(line) && line.length < 100) return false;
  if (
    /\b(subscribe|start trial|privacy|cookie|newsletter|previous|next post|leave a comment|related posts)\b/i.test(
      line
    )
  ) {
    return false;
  }
  return true;
}

export function clipToRecipeBody(text: string): string {
  const match = text.match(/(^|\n)\s*ingredients?\b/i);
  if (!match || match.index == null) return text.slice(0, 18000);
  const start = Math.max(0, match.index - 800);
  const fromIng = text.slice(match.index);
  const endRel = fromIng.search(
    /\n\s*(nutrition facts?|nutrition\b|comments?\b|you may also like|related (recipes|posts)|privacy policy|copyright|subscribe to)\b/i
  );
  const end =
    endRel >= 0
      ? match.index + endRel
      : Math.min(text.length, match.index + 10000);
  return text.slice(start, end);
}

/** Split "Appetizer, Lenny Approved" style tags into separate chips. */
export function flattenTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    for (const part of raw.split(/[,;|]/)) {
      const tag = part.replace(/\s+/g, " ").trim();
      if (!tag || tag.length > 40) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
    }
  }
  return out.slice(0, 12);
}

export function filterIngredientRecords<T extends { name: string }>(
  ingredients: T[]
): T[] {
  const coalesced = coalesceIngredientLines(ingredients.map((ing) => ing.name));
  if (coalesced.length === ingredients.length) {
    return ingredients.filter((ing) => looksLikeIngredientLine(ing.name));
  }
  // Names changed — rebuild from coalesced lines, keep first matching section/meta when possible.
  return coalesced
    .filter(looksLikeIngredientLine)
    .map((name, index) => {
      const prior =
        ingredients.find(
          (ing) =>
            name.startsWith(ing.name) ||
            ing.name.startsWith(name.split(",")[0] ?? "")
        ) ?? ingredients[Math.min(index, ingredients.length - 1)];
      return { ...prior, name } as T;
    });
}

/** Collapse duplicate pantry items when the model emits one line per step mention. */
export function dedupeIngredientRecords<
  T extends {
    name: string;
    search_key?: string | null;
    section?: string | null;
    amount?: number | null;
    unit?: string | null;
  },
>(ingredients: T[]): T[] {
  const order: string[] = [];
  const byKey = new Map<string, T>();

  function dedupeKey(ing: T): string {
    const fromName = extractIngredientName(ing.name);
    const noun =
      fromName ||
      ingredientName({
        name: ing.name,
        search_key: ing.search_key ?? undefined,
      });
    const base =
      noun || ing.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!base) return "";
    const section = (ing.section ?? "").trim().toLowerCase();
    return section ? `${section}|${base}` : base;
  }

  function prefer(a: T, b: T): T {
    if (a.amount != null && b.amount == null) return a;
    if (b.amount != null && a.amount == null) return b;
    return a.name.length >= b.name.length ? a : b;
  }

  for (const ing of ingredients) {
    const key = dedupeKey(ing);
    if (!key || key === "ingredient") continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ing);
      order.push(key);
      continue;
    }
    byKey.set(key, prefer(existing, ing));
  }

  return order.map((key) => byKey.get(key)!);
}

export function filterStepRecords<T extends { instruction: string }>(
  steps: T[]
): T[] {
  return steps.filter((step) => looksLikeStepLine(step.instruction));
}
