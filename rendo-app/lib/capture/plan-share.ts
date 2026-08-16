import {
  captionBesideUrls,
  hasUsableInstagramCaption,
  isInstagramUrl,
} from "@/lib/extract/instagram";

export type SharePlan =
  | { kind: "extract-text"; payload: string }
  | { kind: "extract-url"; url: string }
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
 * Route a share or clipboard payload without scraping Instagram.
 * Caption in hand → extract. Instagram URL only → ask the user to paste.
 * Other recipe sites still fetch as a URL.
 */
export function planShare(share: {
  url?: string;
  text?: string;
}): SharePlan {
  const text = (share.text ?? "").trim();
  const url =
    share.url?.trim() || text.match(/https?:\/\/\S+/i)?.[0] || "";
  const combined = combinedPayload(url, text);
  const caption = captionBesideUrls(combined);

  if (url && isInstagramUrl(url)) {
    if (hasUsableInstagramCaption(combined)) {
      return { kind: "extract-text", payload: textExtractPayload(url, text) };
    }
    return { kind: "need-caption", url };
  }

  if (caption.length >= 20) {
    return { kind: "extract-text", payload: textExtractPayload(url, text) };
  }

  if (url) {
    return { kind: "extract-url", url };
  }

  if (text.length >= 20) {
    return { kind: "extract-text", payload: textExtractPayload("", text) };
  }

  return { kind: "empty" };
}
