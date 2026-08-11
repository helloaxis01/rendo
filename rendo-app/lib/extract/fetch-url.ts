/** Fetch a recipe URL and return readable text for extraction. */

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

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

  const target = parsed.toString();

  // 1) Direct fetch with browser-like headers
  try {
    const direct = await fetchHtml(target);
    const extracted = extractRecipeText(direct.html, target);
    if (extracted) return extracted;
  } catch {
    // try fallbacks below
  }

  // 2) Jina reader proxy — helps when publishers block datacenter IPs (Netlify)
  try {
    const proxied = await fetchHtml(`https://r.jina.ai/${target}`, {
      Accept: "text/plain",
    });
    const plain = proxied.html.replace(/\s+/g, " ").trim();
    if (plain.length >= 80) {
      const title =
        plain.match(/Title:\s*(.+?)(?:\s{2,}|\n|$)/i)?.[1]?.trim() ??
        undefined;
      return {
        url: target,
        title,
        text: plain.slice(0, 40000),
      };
    }
  } catch {
    // fall through
  }

  throw new Error(
    "Couldn’t read that recipe page (site may be blocking imports). Use Paste Recipe Text instead."
  );
}

async function fetchHtml(
  url: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ html: string; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...extraHeaders,
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    const html = await res.text();
    return { html, contentType };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out fetching that link.");
    }
    throw error instanceof Error ? error : new Error("Fetch failed");
  } finally {
    clearTimeout(timeout);
  }
}

function extractRecipeText(
  html: string,
  url: string
): { url: string; title?: string; text: string } | null {
  const jsonLd = extractJsonLdRecipe(html);
  if (jsonLd) {
    return {
      url,
      title: jsonLd.name,
      text: jsonLd.text.slice(0, 40000),
    };
  }

  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim() ?? undefined;

  const text = htmlToReadableText(html).slice(0, 40000);
  if (text.length < 80) return null;

  // Avoid treating soft-404 / interstitial pages as recipes
  const lower = `${title ?? ""}\n${text.slice(0, 500)}`.toLowerCase();
  if (
    lower.includes("access denied") ||
    lower.includes("captcha") ||
    lower.includes("page not found") ||
    lower.includes("enable javascript")
  ) {
    return null;
  }

  return { url, title, text };
}

function extractJsonLdRecipe(html: string): { name?: string; text: string } | null {
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((m) => m[1]);

  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block);
    } catch {
      continue;
    }

    const recipe = findRecipeNode(data);
    if (!recipe) continue;

    const name =
      typeof recipe.name === "string" ? recipe.name.trim() : undefined;
    const description =
      typeof recipe.description === "string" ? recipe.description.trim() : "";
    const ingredients = asStringList(recipe.recipeIngredient);
    const instructions = flattenInstructions(recipe.recipeInstructions);
    const totalTime =
      typeof recipe.totalTime === "string" ? recipe.totalTime : "";
    const recipeYield = recipe.recipeYield;
    const servings =
      typeof recipeYield === "string" || typeof recipeYield === "number"
        ? String(recipeYield)
        : Array.isArray(recipeYield)
          ? recipeYield.map(String).join(", ")
          : "";

    const text = [
      name ? `Title: ${name}` : null,
      description ? `Description: ${description}` : null,
      totalTime ? `Total time: ${totalTime}` : null,
      servings ? `Yield: ${servings}` : null,
      ingredients.length ? `Ingredients:\n${ingredients.map((i) => `- ${i}`).join("\n")}` : null,
      instructions.length
        ? `Steps:\n${instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (ingredients.length >= 2 || instructions.length >= 2) {
      return { name, text };
    }
  }

  return null;
}

function findRecipeNode(data: unknown): Record<string, unknown> | null {
  const queue: unknown[] = [data];
  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];
    if (types.includes("Recipe")) return obj;
    if (Array.isArray(obj["@graph"])) queue.push(obj["@graph"]);
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "text" in item) {
        return String((item as { text: unknown }).text).trim();
      }
      return "";
    })
    .filter(Boolean);
}

function flattenInstructions(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      if (item.trim()) out.push(item.trim());
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const type = String(obj["@type"] ?? "");
    if (type === "HowToSection" && Array.isArray(obj.itemListElement)) {
      out.push(...flattenInstructions(obj.itemListElement));
      continue;
    }
    const text =
      typeof obj.text === "string"
        ? obj.text
        : typeof obj.name === "string"
          ? obj.name
          : "";
    if (text.trim()) out.push(text.trim());
  }
  return out;
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
