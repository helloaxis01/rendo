/** Fetch a recipe URL and return readable text for extraction. */
export async function fetchUrlSource(url: string): Promise<{
  url: string;
  title?: string;
  text: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn’t look like a valid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http(s) recipe links are supported.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RENDO/1.0; +https://rendorecipes.netlify.app)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out fetching that link.");
    }
    throw new Error("Couldn’t fetch that link. Try pasting the recipe text instead.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Link fetch failed (${res.status}). Try pasting the recipe text.`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();

  if (
    contentType.includes("text/plain") ||
    contentType.includes("markdown") ||
    !contentType.includes("html")
  ) {
    const plain = raw.replace(/\s+/g, " ").trim();
    return {
      url: parsed.toString(),
      text: plain.slice(0, 40000) || parsed.toString(),
    };
  }

  const title =
    raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim() ?? undefined;

  const text = htmlToReadableText(raw).slice(0, 40000);
  if (text.length < 40) {
    throw new Error(
      "Couldn’t read recipe text from that page (maybe blocked). Paste the recipe text instead."
    );
  }

  return { url: parsed.toString(), title, text };
}

function htmlToReadableText(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  cleaned = cleaned
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return cleaned
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
