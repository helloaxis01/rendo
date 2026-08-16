import { decodeHtmlEntities } from "@/lib/text/html-entities";
import type { FetchedSource } from "@/lib/extract/fetch-url";
import { isInstagramUrl } from "@/lib/extract/instagram";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export function instagramShortcode(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Instagram.com is login-walled. Recover the public caption from mirrors / readers
 * so Share-to-RENDO still works when Instagram only sends the URL.
 */
export async function fetchInstagramSource(
  url: string
): Promise<FetchedSource | null> {
  if (!isInstagramUrl(url)) return null;
  const code = instagramShortcode(url);
  if (!code) return null;

  const mirrors = [
    `https://imginn.com/p/${code}/`,
    `https://imginn.com/reel/${code}/`,
    `https://www.imginn.com/p/${code}/`,
    `https://r.jina.ai/https://imginn.com/p/${code}/`,
    `https://r.jina.ai/https://imginn.com/reel/${code}/`,
    `https://r.jina.ai/https://www.instagram.com/p/${code}/`,
    `https://r.jina.ai/https://www.instagram.com/reel/${code}/`,
  ];

  const results = await Promise.allSettled(
    mirrors.map(async (mirror) => {
      const html = await fetchText(mirror);
      if (isBlockedChallenge(html)) return null;
      return (
        parseInstagramMirrorHtml(html, url) || parseReaderCaption(html, url)
      );
    })
  );
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const parsed = result.value;
    if (parsed && parsed.text.trim().length >= 40) return parsed;
  }

  try {
    const oembed = await fetchOEmbed(url);
    if (oembed && oembed.text.trim().length >= 40) return oembed;
  } catch {
    // optional
  }

  return null;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
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
      metaContent(html, "twitter:description") ||
      metaContent(html, "description");
    if (og) caption = cleanMirrorBoilerplate(og);
  }

  if (caption.length < 40) {
    const fromTitle = captionFromInstagramTitle(
      metaContent(html, "og:title") || titleFromHtml(html)
    );
    if (fromTitle) caption = fromTitle;
  }

  if (caption.length < 40) return null;

  const author =
    metaContent(html, "og:title")?.match(/@([A-Za-z0-9._]+)/)?.[1] ||
    html.match(/\(@([A-Za-z0-9_-]+)\)/)?.[1] ||
    metaContent(html, "og:title")?.match(/^(.+?)\s+on Instagram/i)?.[1] ||
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

function parseReaderCaption(
  body: string,
  sourceUrl: string
): FetchedSource | null {
  if (/<[a-z][\s\S]*>/i.test(body.slice(0, 400)) && /<html[\s>]/i.test(body)) {
    return null;
  }
  let caption = body
    .replace(/^Title:\s*.+$/im, "")
    .replace(/^URL Source:\s*.+$/im, "")
    .replace(/^Markdown Content:\s*/im, "")
    .replace(/^Warning:.*$/gim, "")
    .trim();
  caption = cleanMirrorBoilerplate(caption);
  if (isBlockedChallenge(caption) || caption.length < 40) return null;

  return {
    url: sourceUrl,
    title: guessTitleFromCaption(caption),
    text: [
      `Source URL: ${sourceUrl}`,
      "Instagram post",
      "",
      "Post caption:",
      caption,
    ].join("\n").slice(0, 40000),
  };
}

function captionFromInstagramTitle(title: string | null): string | null {
  if (!title) return null;
  const match = title.match(/on Instagram:\s*[“"']([\s\S]+?)[”"']\s*$/i);
  const caption = match?.[1]?.trim();
  return caption && caption.length >= 40 ? caption : null;
}

function titleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, " ")).trim();
}

function isBlockedChallenge(html: string): boolean {
  const head = html.slice(0, 2500);
  return /just a moment|attention required|cf-challenge|verify you are human|cloudflare/i.test(
    head
  );
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
