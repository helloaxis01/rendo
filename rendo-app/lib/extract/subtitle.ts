/** Source-based one-line tagline. No ingredient/tag templates. */

const GENERIC =
  /\b(delicious|yummy|tasty|amazing|must[- ]try|homemade goodness|easy recipe|click (here|link)|subscribe)\b/i;

const SKIP_LINE =
  /^(source url|page title|title hint|instagram @|tiktok|facebook|post caption|raw content|source type|file:|pdf file|image file|ingredients?|steps?|directions?|method|yield|servings?|prep time|total time|description)\b/i;

export function normalizeSubtitle(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 12 || text.length > 110) return null;
  if (GENERIC.test(text)) return null;
  if (/^https?:\/\//i.test(text)) return null;
  return text.replace(/[.!?]+$/g, "").trim();
}

/** Shown on type covers: stored source line, or a user edit. Never invented from pantry. */
export function displaySubtitle(recipe: {
  subtitle?: string | null;
  subtitle_manual?: boolean;
}): string | null {
  if (recipe.subtitle_manual) {
    return recipe.subtitle?.replace(/\s+/g, " ").trim() || null;
  }
  return normalizeSubtitle(recipe.subtitle);
}

/**
 * Pull a short distinctive line from original source copy (caption, headnote).
 * Prefer Gemini’s paraphrased `subtitle` when present; this is the no-model fallback.
 */
export function pickSourceSubtitle(sourceText: string | null | undefined): string | null {
  if (!sourceText?.trim()) return null;

  const withoutMeta = sourceText
    .replace(/^Source URL:.*$/gim, "")
    .replace(/^Page title:.*$/gim, "")
    .replace(/^Title hint:.*$/gim, "")
    .replace(/^Instagram @.*$/gim, "")
    .replace(/^Post caption:\s*/gim, "");

  const prose = withoutMeta
    .split(/\n(?:ingredients?|steps?|directions?|method)\b/i)[0]
    .replace(/#\w+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = prose
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, "").trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    if (SKIP_LINE.test(sentence)) continue;
    if (/^\d/.test(sentence) && /\b(cup|tbsp|tsp|oz|g|ml)\b/i.test(sentence)) continue;
    const picked = normalizeSubtitle(sentence.slice(0, 110));
    if (picked) return picked;
  }

  const lines = withoutMeta
    .split(/\n/)
    .map((line) => line.replace(/#\w+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    const picked = normalizeSubtitle(line);
    if (picked) return picked;
  }

  return null;
}
