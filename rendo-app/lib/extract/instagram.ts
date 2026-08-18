import { notEnoughInfoMessage } from "@/lib/extract/status";

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

/** Usable share captions are at least this long after URLs/chrome are stripped. */
export const CAPTION_MIN_CHARS = 40;
/** Shorthand ingredient lists can pass a bit under the cutoff when they look like a recipe. */
export const CAPTION_HINT_MIN_CHARS = 32;

export const INSTAGRAM_CAPTION_MISSING = notEnoughInfoMessage("share");

export const INSTAGRAM_USE_WEBSITE_MESSAGE = INSTAGRAM_CAPTION_MISSING;

export const SOCIAL_USE_SCREENSHOTS_MESSAGE =
  "Instagram and TikTok links don’t import reliably. Screenshot the post (ingredients, then steps) and add up to 4 shots under From a Photo.";

/** True for tiktok.com post / profile / vm.tiktok.com short links. */
export function isTikTokUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  } catch {
    const trimmed = url.trim().toLowerCase();
    return /(?:^|\/\/)(?:www\.)?tiktok\.com\//.test(trimmed);
  }
}

export function isSocialPostUrl(url: string): boolean {
  return isInstagramUrl(url) || isTikTokUrl(url);
}

export function payloadHasTikTokUrl(payload: string): boolean {
  const match = payload.match(/https?:\/\/\S+/gi) ?? [];
  if (match.some(isTikTokUrl)) return true;
  if (isTikTokUrl(payload.trim())) return true;
  return /(?:^|\s)(?:www\.)?tiktok\.com\/(?:@[\w.]+|t\/|video\/)/i.test(
    payload
  );
}

export function payloadHasSocialPostUrl(payload: string): boolean {
  return payloadHasInstagramUrl(payload) || payloadHasTikTokUrl(payload);
}

const RECIPE_HINT =
  /\b(cup|cups|c\b|tbsp|tsp|tablespoon|teaspoon|ingredient|oz|ounce|grams?|ml|bake|mix|chop|simmer|saute|sauté|preheat|clove|garlic|salt|pepper|oil|flour|egg|eggs|onion|tomato|recipe|minutes?|mins?|directions?|method|instructions?|steps?)\b/i;

const INSTAGRAM_CHROME =
  /^(see (this|my) (instagram|reel|post|photo|tiktok|video)|check out this (instagram |)?(reel|post|photo|tiktok|video)|view (this )?(reel|post) on instagram|instagram|tiktok)$/i;

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
    .replace(/\b(?:www\.)?(?:vm\.)?tiktok\.com\/\S+/gi, " ")
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

export function explainInstagramCaptionGate(payload: string): {
  pass: boolean;
  reason: string;
  captionLength: number;
} {
  const caption = captionBesideUrls(payload);
  if (!caption) {
    return { pass: false, reason: "empty after stripping URLs", captionLength: 0 };
  }
  if (INSTAGRAM_CHROME.test(caption)) {
    return {
      pass: false,
      reason: "instagram chrome",
      captionLength: caption.length,
    };
  }
  if (caption.length >= CAPTION_MIN_CHARS) {
    return {
      pass: true,
      reason: `caption length >= ${CAPTION_MIN_CHARS}`,
      captionLength: caption.length,
    };
  }
  if (RECIPE_HINT.test(caption) && caption.length >= CAPTION_HINT_MIN_CHARS) {
    return {
      pass: true,
      reason: `recipe hint with length >= ${CAPTION_HINT_MIN_CHARS}`,
      captionLength: caption.length,
    };
  }
  return {
    pass: false,
    reason: `caption shorter than ${CAPTION_MIN_CHARS} without recipe hint`,
    captionLength: caption.length,
  };
}

export function hasUsableInstagramCaption(payload: string): boolean {
  const decision = explainInstagramCaptionGate(payload);
  logInstagramShare(decision.pass ? "gate:pass" : "gate:fail", { text: payload }, {
    reason: decision.reason,
    captionLength: decision.captionLength,
    captionSlice: captionBesideUrls(payload).slice(0, 200),
  });
  return decision.pass;
}

/** Caption has a recipe body (ingredients and/or steps), not just a link or share chrome. */
export function looksLikeRecipeCaption(payload: string): boolean {
  const caption = captionBesideUrls(payload);
  if (!caption) return false;
  if (INSTAGRAM_CHROME.test(caption)) return false;
  const hasIngredients = /\bingredients?\b/i.test(caption);
  const hasMethod =
    /\b(directions?|instructions?|method|steps?)\b/i.test(caption);
  if (hasIngredients && hasMethod) return true;
  if ((hasIngredients || hasMethod) && caption.length >= CAPTION_HINT_MIN_CHARS) {
    return true;
  }
  return explainInstagramCaptionGate(payload).pass;
}

type IncomingShareLike = {
  url?: string;
  text?: string;
  images?: string[];
  imageCount?: number;
  silent?: boolean;
  later?: boolean;
  notified?: boolean;
  recipes?: unknown[];
};

export function mergeIncomingShares<T extends IncomingShareLike>(
  current: T | null,
  incoming: T
): T {
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
    ...current,
    ...incoming,
    url: incoming.url || current.url,
    text: incomingText.length >= currentText.length ? incoming.text : current.text,
    images:
      incoming.images?.length ? incoming.images : current.images,
    imageCount:
      incoming.imageCount ||
      incoming.images?.length ||
      current.imageCount ||
      current.images?.length,
  };
  logInstagramShare("merge:result", merged, {
    previousTextLength: currentText.length,
    incomingTextLength: incomingText.length,
    captionWon: incomingText.length > currentText.length,
    imageCount: merged.imageCount ?? 0,
  });
  return merged as T;
}

/** Instagram link with no caption text — not a public recipe page. */
export function isInstagramWithoutCaption(payload: string): boolean {
  if (!payloadHasInstagramUrl(payload)) return false;
  return !hasUsableInstagramCaption(payload);
}

/** Instagram/TikTok URL with a missing or too-thin caption. */
export function isSocialWithoutUsableCaption(payload: string): boolean {
  if (!payloadHasSocialPostUrl(payload)) return false;
  return !hasUsableInstagramCaption(payload);
}
