import {
  captionBesideUrls,
  hasUsableInstagramCaption,
  isSocialPostUrl,
  payloadHasSocialPostUrl,
} from "@/lib/extract/instagram";

export type SharePlan =
  | { kind: "extract-text"; payload: string }
  | { kind: "extract-url"; url: string }
  | { kind: "extract-images" }
  | { kind: "need-website"; url: string }
  | { kind: "need-caption"; url: string }
  | { kind: "empty" };

function combinedPayload(url: string, text: string) {
  return [text.trim(), url.trim()].filter(Boolean).join("\n");
}

function textExtractPayload(url: string, text: string) {
  const combined = combinedPayload(url, text);
  if (url) {
    return `Source URL: ${url}\n\n${combined}`.slice(0, 40000);
  }
  return combined.slice(0, 40000);
}

/**
 * Shared screenshots → vision extract.
 * Instagram/TikTok with a usable caption → Gemini text extract.
 * Thin/missing social captions → wait briefly, then ask for more input.
 * Other recipe sites still fetch as a URL.
 */
export function planShare(share: {
  url?: string;
  text?: string;
  images?: string[];
  imageCount?: number;
}): SharePlan {
  const text = (share.text ?? "").trim();
  const url =
    share.url?.trim() || text.match(/https?:\/\/\S+/i)?.[0] || "";
  const combined = combinedPayload(url, text);
  const caption = captionBesideUrls(combined);
  const social = Boolean(
    (url && isSocialPostUrl(url)) || payloadHasSocialPostUrl(combined)
  );

  if (share.images?.length || (share.imageCount && share.imageCount > 0)) {
    return { kind: "extract-images" };
  }

  if (hasUsableInstagramCaption(combined)) {
    return { kind: "extract-text", payload: textExtractPayload(url, text) };
  }

  if (social) {
    if (!caption) return { kind: "need-caption", url };
    return { kind: "need-website", url };
  }

  if (url) {
    return { kind: "extract-url", url };
  }

  if (text.length >= 20) {
    return { kind: "extract-text", payload: textExtractPayload("", text) };
  }

  return { kind: "empty" };
}
