import type { ExtractedRecipe } from "@/lib/db/types";
import { resolveActionHeader } from "@/lib/extract/action-header";
import { isInstagramUrl } from "@/lib/extract/instagram";
import { decodeHtmlEntities } from "@/lib/text/html-entities";
import { pickSourceSubtitle } from "@/lib/extract/subtitle";

export type FetchedSource = {
  url: string;
  title?: string;
  text: string;
  imageUrl?: string | null;
  /** When JSON-LD Recipe is present, a ready-to-save recipe without Gemini. */
  structured?: ExtractedRecipe;
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** Fetch a recipe URL and return readable text (+ structured recipe when possible). */
export async function fetchUrlSource(url: string): Promise<FetchedSource> {
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
  const errors: string[] = [];

  // Instagram is login-walled — never scrape it. Caption must arrive as text.
  if (isInstagramUrl(target)) {
    throw new Error("instagram-caption-missing");
  }

  // 1) Direct fetch with browser-like headers
  try {
    const direct = await fetchHtml(target);
    const extracted = extractRecipeText(direct.html, target);
    if (extracted) return extracted;
    errors.push("direct: no recipe content");
  } catch (error) {
    errors.push(
      `direct: ${error instanceof Error ? error.message : "failed"}`
    );
  }

  // 2) Reader / CORS proxies — helps when publishers block datacenter IPs (Netlify)
  const proxyUrls = [
    `https://r.jina.ai/${target}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
  ];

  for (const proxyUrl of proxyUrls) {
    try {
      const proxied = await fetchHtml(proxyUrl, {
        Accept: "text/html,text/plain,*/*",
      });
      const body = proxied.html.trim();
      if (body.length < 80) {
        errors.push(`proxy: empty (${proxyUrl.slice(0, 40)})`);
        continue;
      }

      // HTML with JSON-LD / readable recipe body
      if (/<html[\s>]|application\/ld\+json|recipeIngredient/i.test(body)) {
        const extracted = extractRecipeText(body, target);
        if (extracted) return extracted;
      }

      // Plain / markdown reader output (Jina)
      const title =
        body.match(/^Title:\s*(.+)$/im)?.[1]?.trim() ??
        body.match(/Title:\s*(.+?)(?:\n|$)/i)?.[1]?.trim() ??
        undefined;
      const text = body.slice(0, 40000);
      const structured = structuredFromPlainText(text, target, title);
      return { url: target, title, text, structured };
    } catch (error) {
      errors.push(
        `proxy: ${error instanceof Error ? error.message : "failed"}`
      );
    }
  }

  throw new Error(
    `Couldn’t read that recipe page (site may be blocking imports). Use Paste Recipe Text instead.`
  );
}

/** Parse a recipe from raw HTML (JSON-LD preferred). Used when the browser fetches the page. */
export function parseRecipeFromHtml(
  html: string,
  url: string
): FetchedSource | null {
  return extractRecipeText(html, url);
}

async function fetchHtml(
  url: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ html: string; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

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

function extractRecipeText(html: string, url: string): FetchedSource | null {
  const jsonLd = extractJsonLdRecipe(html, url);
  if (jsonLd) {
    return {
      url,
      title: jsonLd.structured.title,
      text: jsonLd.text.slice(0, 40000),
      structured: jsonLd.structured,
    };
  }

  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim() ?? undefined;

  // Instagram / social login shells look huge but have no recipe content.
  if (
    title &&
    /^(instagram|tiktok|facebook|youtube|pinterest)\b/i.test(title) &&
    !/class="desc"/i.test(html)
  ) {
    return null;
  }

  const text = htmlToReadableText(html).slice(0, 40000);
  if (text.length < 80) return null;

  const lower = `${title ?? ""}\n${text.slice(0, 500)}`.toLowerCase();
  if (
    lower.includes("access denied") ||
    lower.includes("captcha") ||
    lower.includes("page not found") ||
    lower.includes("enable javascript")
  ) {
    return null;
  }

  return {
    url,
    title,
    text,
    structured: structuredFromPlainText(text, url, title),
  };
}

function extractJsonLdRecipe(
  html: string,
  url: string
): { text: string; structured: ExtractedRecipe } | null {
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
    const prepTimeRaw =
      typeof recipe.prepTime === "string" ? recipe.prepTime : "";
    const cookTimeRaw =
      typeof recipe.cookTime === "string" ? recipe.cookTime : "";
    const recipeYield = recipe.recipeYield;
    const servingsRaw =
      typeof recipeYield === "string" || typeof recipeYield === "number"
        ? String(recipeYield)
        : Array.isArray(recipeYield)
          ? recipeYield.map(String).join(", ")
          : "";
    const image = firstImageUrl(recipe.image);

    if (ingredients.length < 2 && instructions.length < 2) continue;

    const text = [
      name ? `Title: ${name}` : null,
      description ? `Description: ${description}` : null,
      totalTime ? `Total time: ${totalTime}` : null,
      servingsRaw ? `Yield: ${servingsRaw}` : null,
      ingredients.length
        ? `Ingredients:\n${ingredients.map((i) => `- ${i}`).join("\n")}`
        : null,
      instructions.length
        ? `Steps:\n${instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const structured = buildStructuredRecipe({
      title: name || "Imported Recipe",
      url,
      ingredients,
      instructions,
      prepMinutes: pickPrepMinutes(prepTimeRaw, cookTimeRaw, totalTime),
      servings: parseServings(servingsRaw) ?? 4,
      imageUrl: image,
      description,
    });

    return { text, structured };
  }

  return null;
}

export function structuredFromPlainText(
  text: string,
  url: string,
  titleHint?: string
): ExtractedRecipe | undefined {
  const title =
    titleHint ||
    text.match(/^Title:\s*(.+)$/im)?.[1]?.trim() ||
    text.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    text
      .split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          l.length > 2 &&
          l.length < 80 &&
          !/^file:/i.test(l) &&
          !/^source url:/i.test(l) &&
          !/^ingredients?\b/i.test(l) &&
          !/^steps?\b/i.test(l) &&
          !/^directions?\b/i.test(l) &&
          !/^servings?\b/i.test(l) &&
          !/^prep\b/i.test(l) &&
          !/^https?:/i.test(l)
      ) ||
    "Imported Recipe";

  const ingredientSection = sliceMarkdownSection(text, [
    "ingredients",
    "ingredient",
  ], ["directions", "direction", "method", "steps", "instructions", "make ahead", "suggested pairing", "reviews", "related articles"]);

  const stepSection = sliceMarkdownSection(text, [
    "directions",
    "direction",
    "method",
    "steps",
    "instructions",
  ], ["make ahead", "suggested pairing", "reviews", "related articles", "nutrition"]);

  const ingredients = parseIngredientLines(
    ingredientSection ||
      text.match(/ingredients?\s*[:\n]+([\s\S]*?)(?:\n\s*(?:steps?|directions?|instructions?|method)\b|$)/i)?.[1] ||
      ""
  );

  const instructions = parseStepLines(
    stepSection ||
      text.match(/(?:steps?|directions?|instructions?|method)\s*[:\n]+([\s\S]*?)$/i)?.[1] ||
      ""
  );

  if (ingredients.length < 2 || instructions.length < 1) return undefined;

  return buildStructuredRecipe({
    title: title.replace(/^#+\s*/, "").slice(0, 120),
    url,
    ingredients,
    instructions,
    prepMinutes: 25,
    servings: 4,
  });
}

function sliceMarkdownSection(
  text: string,
  startHeads: string[],
  endHeads: string[]
): string {
  const lines = text.split(/\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^#{1,3}\s+(.+?)\s*$/);
    if (!heading) continue;
    const name = heading[1].toLowerCase();
    if (startHeads.some((h) => name === h || name.startsWith(h + " "))) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return "";

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const heading = lines[i].match(/^#{1,3}\s+(.+?)\s*$/);
    if (!heading) continue;
    const name = heading[1].toLowerCase();
    if (endHeads.some((h) => name === h || name.startsWith(h + " "))) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function parseIngredientLines(block: string): string[] {
  return block
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*[-*•]\s+/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\*\*/g, "")
        .trim()
    )
    .filter((l) => l.length > 2)
    .filter((l) => !/^(1\/2x|1x|2x)$/i.test(l))
    .filter((l) => !/^oops!/i.test(l))
    .filter((l) => !/something went wrong/i.test(l))
    .filter((l) => !/automatically adjusted/i.test(l))
    .filter((l) => !/original recipe/i.test(l))
    .filter((l) => !/not all recipes scale/i.test(l))
    .filter((l) => !/^ingredients?$/i.test(l))
    .filter((l) => !/^[A-Z][A-Za-z ]{1,24}$/.test(l)) // section labels like "Chicken"
    .slice(0, 60);
}

function parseStepLines(block: string): string[] {
  const chunks = block
    .split(/\n(?=\s*\d+[.)]\s+)/)
    .map((chunk) => {
      let text = chunk
        .replace(/^\s*\d+[.)]\s*/, "")
        .replace(/\*\*/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\n+/g, " ")
        .trim();
      // "Pickle the peaches: Pickle the peaches: Bring..." → keep body
      text = text.replace(/^([^:]{3,40}):\s+\1:\s+/i, "$1: ");
      return text;
    })
    .filter((l) => l.length > 8)
    .filter((l) => !/^(steps?|directions?|instructions?|method)$/i.test(l));

  if (chunks.length >= 1) return chunks.slice(0, 40);

  return block
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l.length > 8)
    .slice(0, 40);
}

function buildStructuredRecipe(input: {
  title: string;
  url: string;
  ingredients: string[];
  instructions: string[];
  prepMinutes: number;
  servings: number;
  imageUrl?: string | null;
  description?: string;
}): ExtractedRecipe {
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);

  return {
    id: `rec_${slug || crypto.randomUUID().slice(0, 8)}`,
    title: decodeHtmlEntities(input.title),
    subtitle: pickSourceSubtitle(input.description),
    subtitle_manual: false,
    source_handle: hostHandle(input.url),
    source_url: input.url,
    prep_time_minutes: input.prepMinutes,
    servings_base: input.servings,
    cover_image_url: input.imageUrl ?? null,
    cover_fallback_label: decodeHtmlEntities(input.title).toUpperCase().slice(0, 24),
    cover_display: input.imageUrl ? "photo" : "type",
    is_favorite: false,
    tags: guessTags(input.title, input.description ?? ""),
    ingredients_normalized: input.ingredients.map((line, i) =>
      parseIngredientLine(decodeHtmlEntities(line), i)
    ),
    steps: input.instructions.map((instruction, i) => {
      const cleaned = decodeHtmlEntities(instruction);
      return {
        step_number: i + 1,
        action_header: resolveActionHeader(null, cleaned, i),
        instruction: cleaned,
        timer_seconds: null,
      };
    }),
    kitchen_notes: [],
  };
}

function parseIngredientLine(line: string, index: number) {
  const cleaned = line.replace(/\s+/g, " ").trim();
  const match = cleaned.match(
    /^((?:\d+\s+\d+\/\d+)|\d+\/\d+|\d+\.\d+|\d+)?\s*(.*)$/
  );
  const amountRaw = match?.[1]?.trim() || "";
  let rest = (match?.[2] || cleaned).trim();

  let amountNum: number | null = null;
  if (amountRaw) {
    amountNum = 0;
    for (const part of amountRaw.split(/\s+/)) {
      if (part.includes("/")) {
        const [a, b] = part.split("/").map(Number);
        if (b) amountNum += a / b;
      } else {
        const n = Number(part);
        if (Number.isFinite(n)) amountNum += n;
      }
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) amountNum = null;
  }

  const knownUnits = new Set([
    "cup",
    "cups",
    "tbsp",
    "tablespoon",
    "tablespoons",
    "tsp",
    "teaspoon",
    "teaspoons",
    "oz",
    "ounce",
    "ounces",
    "lb",
    "lbs",
    "pound",
    "pounds",
    "g",
    "gram",
    "grams",
    "kg",
    "ml",
    "l",
    "clove",
    "cloves",
    "can",
    "cans",
    "stalk",
    "stalks",
    "tablespoons",
  ]);

  let unit: string | null = null;
  const unitMatch = rest.match(/^([A-Za-z]+)\b\s*(.*)$/);
  if (unitMatch && knownUnits.has(unitMatch[1].toLowerCase())) {
    unit = unitMatch[1].toLowerCase();
    rest = unitMatch[2].trim();
  }

  const name = rest || cleaned;

  return {
    id: `ing_${index + 1}`,
    amount: amountNum,
    unit,
    name,
    search_key:
      name.toLowerCase().split(/\s+/).slice(-2).join(" ") || "ingredient",
    checked: false,
  };
}

function guessTags(title: string, description: string): string[] {
  const blob = `${title} ${description}`.toLowerCase();
  const tags: string[] = [];
  if (/chicken|beef|pork|lamb|fish|shrimp|salmon/.test(blob)) tags.push("Dinner");
  if (/grill/.test(blob)) tags.push("Grilling");
  if (/chicken/.test(blob)) tags.push("Chicken");
  if (/pasta|noodle/.test(blob)) tags.push("Pasta");
  if (/salad/.test(blob)) tags.push("Salad");
  if (/breakfast|pancake|egg/.test(blob)) tags.push("Breakfast");
  if (/quick|30 minute|weeknight/.test(blob)) tags.push("Quick Meals");
  if (!tags.length) tags.push("Dinner");
  return [...new Set(tags)].slice(0, 5);
}

function hostHandle(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function firstImageUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImageUrl(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url: unknown }).url;
    if (typeof url === "string") return url;
  }
  return null;
}

function parseServings(raw: string): number | null {
  const match = raw.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseIsoDurationMinutes(raw: string): number | null {
  // PT1H15M / PT45M / PT615M
  const match = raw.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const mins = Number(match[2] || 0);
  const secs = Number(match[3] || 0);
  const total = hours * 60 + mins + Math.round(secs / 60);
  return total > 0 ? total : null;
}

/** Prefer prep, then cook, then total — clamp absurd schema.org totals. */
function pickPrepMinutes(
  prepRaw: string,
  cookRaw: string,
  totalRaw: string
): number {
  const prep = prepRaw ? parseIsoDurationMinutes(prepRaw) : null;
  const cook = cookRaw ? parseIsoDurationMinutes(cookRaw) : null;
  const total = totalRaw ? parseIsoDurationMinutes(totalRaw) : null;
  const candidate = prep ?? cook ?? total ?? 25;
  return Math.max(1, Math.min(candidate, 12 * 60));
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
    .replace(/&nbsp;/gi, " ");

  const decoded = decodeHtmlEntities(cleaned);

  return decoded
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
