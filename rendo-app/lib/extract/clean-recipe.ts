/** Drop site chrome so imports keep only foods and cooking steps. */

const CHROME_LINE =
  /^(start(\s+your)?\s+(free\s+)?trial|begin(\s+your)?\s+trial|previous(\s*\/\s*|\s+)?next|previous|next|privacy(\s+policy)?|terms(\s+of\s+(use|service|service))?|privacy\s*[&+]?\s*terms|cookie(s|\s+policy)?|subscribe( now)?|sign\s*up|log\s*in|sign\s*in|skip to( content| recipe)?|jump to recipe|leave a comment|related posts|you may also like|pin it|share( this)?|print( recipe)?|search|home|about|contact|shop|follow (us|me)|enable javascript|all rights reserved|copyright|newsletter|comments?|save recipe|rate this|load more|read more|continue reading)$/i;

const CHROME_PHRASE =
  /\b(start(\s+your)?\s+trial|free trial|privacy policy|terms of (use|service)|cookie policy|all rights reserved|subscribe to|newsletter|leave a comment|related (posts|recipes)|skip to content|as an amazon associate|affiliate)\b/i;

const COOK_MEASURE =
  /\b(\d|¼|½|¾|⅓|⅔|cup|cups|tbsp|tsp|tablespoon|teaspoon|oz|ounce|gram|ml|clove|pinch|dash|to taste|salt|pepper|oil|flour|egg|butter|sugar|garlic|onion)\b/i;

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

export function looksLikeIngredientLine(text: string): boolean {
  if (isChromeLine(text)) return false;
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length < 2 || line.length > 90) return false;
  if (/^(ingredients?|directions?|method|steps?|instructions?)$/i.test(line)) {
    return false;
  }
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

export function filterIngredientRecords<T extends { name: string }>(
  ingredients: T[]
): T[] {
  return ingredients.filter((ing) => looksLikeIngredientLine(ing.name));
}

export function filterStepRecords<T extends { instruction: string }>(
  steps: T[]
): T[] {
  return steps.filter((step) => looksLikeStepLine(step.instruction));
}
