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
  /\b(cup|cups|c\b|tbsp|tsp|tablespoon|teaspoon|ingredient|oz|ounce|grams?|ml|bake|mix|chop|simmer|saute|sauté|preheat|clove|garlic|salt|pepper|oil|flour|egg|eggs|onion|tomato|recipe|minutes?|mins?|directions?|method|instructions?|steps?)\b/i;

const INSTAGRAM_CHROME =
  /^(see (this|my) (instagram|reel|post|photo)|check out this (instagram |)?(reel|post|photo)|view (this )?(reel|post) on instagram|instagram)$/i;

/** Caption-like text left after stripping URLs and Instagram share chrome. */
export function logInstagramShare(
  stage: string,
  share: { url?: string; text?: string } | null,
  extra?: Record<string, unknown>
) {
  const text = share?.text ?? "";
  console.log("[rendo:ig]", stage, {
    url: share?.url ?? "",
    textLength: text.length,
    textSlice: text.slice(0, 200),
    ...extra,
  });
}

export function captionBesideUrls(payload: string): string {
  return payload
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(?:www\.)?instagram\.com\/\S+/gi, " ")
    .replace(/\b(?:www\.)?instagr\.am\/\S+/gi, " ")
    .replace(/^source url:?\s*/gim, " ")
    .replace(/\b[\w.]+ on instagram:\s*/gi, " ")
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
  if (!caption) {
    logInstagramShare("gate:fail", { text: payload }, { reason: "empty after stripping URLs" });
    return false;
  }
  if (INSTAGRAM_CHROME.test(caption)) {
    logInstagramShare("gate:fail", { text: payload }, {
      reason: "instagram chrome",
      captionLength: caption.length,
      captionSlice: caption.slice(0, 200),
    });
    return false;
  }
  if (caption.length >= 20) {
    logInstagramShare("gate:pass", { text: payload }, {
      reason: "caption length >= 20",
      captionLength: caption.length,
      captionSlice: caption.slice(0, 200),
    });
    return true;
  }
  if (RECIPE_HINT.test(caption) && caption.length >= 18) {
    logInstagramShare("gate:pass", { text: payload }, {
      reason: "recipe hint with length >= 18",
      captionLength: caption.length,
      captionSlice: caption.slice(0, 200),
    });
    return true;
  }
  logInstagramShare("gate:fail", { text: payload }, {
    reason: "caption shorter than 20 without recipe hint",
    captionLength: caption.length,
    captionSlice: caption.slice(0, 200),
  });
  return false;
}

export function mergeIncomingShares(
  current: { url?: string; text?: string } | null,
  incoming: { url?: string; text?: string }
): { url?: string; text?: string } {
  if (!current) {
    logInstagramShare("merge:initial", incoming);
    return incoming;
  }
  if (
    current.url &&
    incoming.url &&
    current.url !== incoming.url
  ) {
    logInstagramShare("merge:replaced-url", incoming, { previousUrl: current.url });
    return incoming;
  }
  const currentText = current.text?.trim() ?? "";
  const incomingText = incoming.text?.trim() ?? "";
  const merged = {
    url: incoming.url || current.url,
    text: incomingText.length >= currentText.length ? incoming.text : current.text,
  };
  logInstagramShare("merge:result", merged, {
    previousTextLength: currentText.length,
    incomingTextLength: incomingText.length,
    captionWon: incomingText.length > currentText.length,
  });
  return merged;
}

/** Instagram link with no usable caption — do not scrape; fail fast. */
export function isInstagramWithoutCaption(payload: string): boolean {
  return payloadHasInstagramUrl(payload) && !hasUsableInstagramCaption(payload);
}
