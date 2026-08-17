import { isUsableImageUrl } from "@/lib/cover";
import { isInstagramUrl } from "@/lib/extract/instagram";

export type InstagramPublicMeta = {
  imageUrl: string | null;
  title: string | null;
};

/** Public OG / oEmbed thumbnail only — not a caption scrape. */
export async function fetchInstagramPublicMeta(
  url: string
): Promise<InstagramPublicMeta> {
  if (!isInstagramUrl(url)) return { imageUrl: null, title: null };

  const oembed = await fetchOembed(url);
  if (oembed.imageUrl || oembed.title) return oembed;

  return fetchOpenGraph(url);
}

async function fetchOembed(url: string): Promise<InstagramPublicMeta> {
  const endpoint = `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`;
  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { imageUrl: null, title: null };
    const data = (await res.json()) as {
      thumbnail_url?: string;
      title?: string;
    };
    return {
      imageUrl: isUsableImageUrl(data.thumbnail_url) ? data.thumbnail_url! : null,
      title: data.title?.trim() || null,
    };
  } catch {
    return { imageUrl: null, title: null };
  }
}

async function fetchOpenGraph(url: string): Promise<InstagramPublicMeta> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return { imageUrl: null, title: null };
    const html = (await res.text()).slice(0, 80_000);
    const image =
      metaContent(html, "og:image") ||
      metaContent(html, "og:image:url") ||
      metaContent(html, "twitter:image");
    const title = metaContent(html, "og:title") || metaContent(html, "twitter:title");
    return {
      imageUrl: isUsableImageUrl(image) ? image : null,
      title: title?.trim() || null,
    };
  } catch {
    return { imageUrl: null, title: null };
  }
}

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i"
  );
  return html.match(pattern)?.[1] ?? html.match(alt)?.[1] ?? null;
}
