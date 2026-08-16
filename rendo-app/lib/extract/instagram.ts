/** True for instagram.com / instagr.am post, reel, or TV URLs. */
export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host === "instagram.com" ||
      host === "instagr.am" ||
      host === "l.instagram.com" ||
      host.endsWith(".instagram.com")
    );
  } catch {
    const trimmed = url.trim().toLowerCase();
    return (
      /(?:^|\/\/)(?:www\.)?instagram\.com\//.test(trimmed) ||
      /(?:^|\/\/)(?:www\.)?instagr\.am\//.test(trimmed)
    );
  }
}

export const INSTAGRAM_CAPTION_MISSING =
  "Couldn't find recipe text in this post. Try copying the post's text directly into Paste Recipe Text, or take a screenshot and import it using Photo.";

const RECIPE_HINT =
  /\b(cup|cups|tbsp|tsp|tablespoon|teaspoon|ingredient|oz|ounce|grams?|ml|bake|mix|chop|simmer|saute|sauté|preheat|clove|garlic|salt|pepper|oil|flour|egg|eggs|onion|tomato|recipe|minutes?|mins?)\b/i;

const INSTAGRAM_CHROME =
  /^(see (this|my) (instagram|reel|post|photo)|check out this (instagram |)?(reel|post|photo)|.*\bon instagram:?$|instagram|view (this )?(reel|post) on instagram)/i;

/** Caption-like text left after stripping URLs and Instagram hosts. */
export function captionBesideUrls(payload: string): string {
  return payload
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(?:www\.)?instagram\.com\/\S+/gi, " ")
    .replace(/\b(?:www\.)?instagr\.am\/\S+/gi, " ")
    .replace(/^source url:?\s*/gim, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function payloadHasInstagramUrl(payload: string): boolean {
  const match = payload.match(/https?:\/\/\S+/gi) ?? [];
  if (match.some(isInstagramUrl)) return true;
  if (isInstagramUrl(payload.trim())) return true;
  return /(?:^|\s)(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\//i.test(
    payload
  );
}

export function hasUsableInstagramCaption(payload: string): boolean {
  const caption = captionBesideUrls(payload);
  if (!caption) return false;
  if (INSTAGRAM_CHROME.test(caption) && caption.length < 80) return false;
  if (caption.length >= 40) return true;
  if (caption.length >= 18 && RECIPE_HINT.test(caption)) return true;
  return false;
}

export function mergeIncomingShares(
  current: { url?: string; text?: string } | null,
  incoming: { url?: string; text?: string }
): { url?: string; text?: string } {
  if (!current) return incoming;
  const sameUrl =
    Boolean(current.url && incoming.url && current.url === incoming.url) ||
    (!current.url && !incoming.url);
  const currentText = current.text?.trim() ?? "";
  const incomingText = incoming.text?.trim() ?? "";
  if (sameUrl && incomingText.length < currentText.length) {
    return {
      url: incoming.url || current.url,
      text: current.text,
    };
  }
  return {
    url: incoming.url || current.url,
    text: incomingText.length >= currentText.length ? incoming.text : current.text,
  };
}

/** Instagram link with no usable caption — do not scrape; fail fast. */
export function isInstagramWithoutCaption(payload: string): boolean {
  return payloadHasInstagramUrl(payload) && !hasUsableInstagramCaption(payload);
}
