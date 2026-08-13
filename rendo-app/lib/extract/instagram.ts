import { decodeHtmlEntities } from "@/lib/text/html-entities";
import type { FetchedSource } from "@/lib/extract/fetch-url";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** True for instagram.com / instagr.am post, reel, or TV URLs. */
export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host === "instagram.com" ||
      host === "instagr.am" ||
      host.endsWith(".instagram.com")
    );
  } catch {
    return false;
  }
}

export function instagramShortcode(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const match = path.match(
      /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Instagram pages are login-walled for server fetches. Pull the public caption
 * via a mirror that still exposes og/desc markup, then hand that text to Gemini.
 */
export async function fetchInstagramSource(
  url: string
): Promise<FetchedSource | null> {
  const code = instagramShortcode(url);
  if (!code) return null;

  const mirrors = [
    `https://imginn.com/p/${code}/`,
    `https://imginn.com/reel/${code}/`,
  ];

  const errors: string[] = [];
  for (const mirror of mirrors) {
    try {
      const html = await fetchText(mirror);
      const parsed = parseInstagramMirrorHtml(html, url);
      if (parsed && parsed.text.trim().length >= 40) {
        return parsed;
      }
      errors.push(`${mirror}: thin caption`);
    } catch (error) {
      errors.push(
        `${mirror}: ${error instanceof Error ? error.message : "failed"}`
      );
    }
  }

  // Last try: Meta oEmbed (rarely includes caption text, but may have author).
  try {
    const oembed = await fetchOEmbed(url);
    if (oembed && oembed.text.trim().length >= 40) return oembed;
  } catch (error) {
    errors.push(
      `oembed: ${error instanceof Error ? error.message : "failed"}`
    );
  }

  return null;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** Parse caption HTML from mirrors like imginn (also used for browser-fetched HTML). */
export function parseInstagramMirrorHtml(
  html: string,
  sourceUrl: string
): FetchedSource | null {
  const descMatch =
    html.match(/class="desc"[^>]*>([\s\S]*?)<ul class="share-to"/i) ||
    html.match(/class="desc"[^>]*>([\s\S]*?)<\/div>/i);

  let caption = "";
  if (descMatch?.[1]) {
    caption = htmlFragmentToText(descMatch[1]);
  }

  if (caption.length < 40) {
    const og =
      metaContent(html, "og:description") ||
      metaContent(html, "description");
    if (og) caption = cleanMirrorBoilerplate(og);
  }

  if (caption.length < 40) return null;

  const author =
    metaContent(html, "og:title")?.match(/@([A-Za-z0-9._]+)/)?.[1] ||
    html.match(/\(@([A-Za-z0-9._]+)\)/)?.[1] ||
    null;

  const titleGuess = guessTitleFromCaption(caption);
  const imageUrl =
    metaContent(html, "og:image") ||
    metaContent(html, "twitter:image") ||
    null;

  const text = [
    `Source URL: ${sourceUrl}`,
    author ? `Instagram @${author}` : "Instagram post",
    titleGuess ? `Title hint: ${titleGuess}` : null,
    "",
    "Post caption:",
    caption,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    url: sourceUrl,
    title: titleGuess || (author ? `@${author} Instagram post` : undefined),
    text: text.slice(0, 40000),
    imageUrl,
    // Never claim structured here — captions need Gemini (or Paste Text).
    structured: undefined,
  };
}

async function fetchOEmbed(url: string): Promise<FetchedSource | null> {
  const endpoint = `https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(url)}&omitscript=true`;
  const raw = await fetchText(endpoint);
  let data: { html?: string; author_name?: string; title?: string };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return null;
  }

  const fromHtml = data.html ? htmlFragmentToText(data.html) : "";
  const cleaned = fromHtml
    .replace(/View this post on Instagram/gi, "")
    .replace(/A post shared by.*/gi, "")
    .trim();

  if (cleaned.length < 40) return null;

  return {
    url,
    title: data.title || data.author_name || undefined,
    text: [
      `Source URL: ${url}`,
      data.author_name ? `Instagram @${data.author_name}` : null,
      "",
      "Post caption:",
      cleaned,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 40000),
  };
}

function metaContent(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(
      `(?:property|name)=["']${escapeReg(prop)}["'][^>]*content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapeReg(prop)}["']`,
      "i"
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]).trim();
  }
  return null;
}

function htmlFragmentToText(fragment: string): string {
  let cleaned = fragment
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<a[^>]*>/gi, "")
    .replace(/<\/a>/gi, "")
    .replace(/<[^>]+>/g, " ");
  cleaned = decodeHtmlEntities(cleaned);
  cleaned = cleaned
    .replace(/\u2060/g, "")
    .replace(/Share To:\s*$/i, "")
    .replace(/\bShare To:\s*(Twitter|Reddit|Line|Snap)\b/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return cleanMirrorBoilerplate(cleaned);
}

function cleanMirrorBoilerplate(text: string): string {
  return text
    .replace(/\s*Video by .+ on .+$/i, "")
    .replace(/\s*May be an image of .+$/i, "")
    .replace(/\s*instagram post download.*$/i, "")
    .trim();
}

function guessTitleFromCaption(caption: string): string | undefined {
  const lines = caption
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 4)) {
    const cleaned = line
      .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, "")
      .replace(/#\w+/g, "")
      .trim();
    if (cleaned.length < 8 || cleaned.length > 90) continue;
    if (/^(ingredients?|directions?|steps?|method|comment)\b/i.test(cleaned)) {
      continue;
    }
    // Prefer lines that look like dish names
    if (
      /\b(soup|salad|pasta|chicken|cake|smoothie|bread|taco|quesadilla|pizza|cookie|muffin|stew|curry|rice|noodles?)\b/i.test(
        cleaned
      ) ||
      /my\s+.+/i.test(cleaned)
    ) {
      return cleaned.slice(0, 80);
    }
  }
  const first = lines[0]
    ?.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, "")
    .slice(0, 80)
    .trim();
  return first && first.length >= 8 ? first : undefined;
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
