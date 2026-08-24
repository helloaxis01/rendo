import { z } from "zod";
import {
  ExtractResponseSchema,
  type ExtractedRecipe,
  type Ingredient,
  type RecipeStep,
} from "@/lib/db/types";
import { resolveActionHeader } from "@/lib/extract/action-header";
import { isUsableImageUrl } from "@/lib/cover";
import { validateGeminiSubtitle } from "@/lib/extract/subtitle";
import { decodeHtmlEntities } from "@/lib/text/html-entities";
import {
  filterIngredientRecords,
  filterStepRecords,
  flattenTags,
  dedupeIngredientRecords,
} from "@/lib/extract/clean-recipe";
import { resolveSearchKey } from "@/lib/ingredients/ingredient-name";

export const EXTRACTION_SYSTEM_PROMPT = `You are RENDO's recipe extraction engine.
Strip ALL fluff: personal essays, memoirs, ad copy, video banter, SEO filler.
Save ONLY functional cooking facts: title, times, servings, ingredients with amounts/units, numbered steps with uppercase action headers, tags, source handle/url when present.

Rules:
1. Phase 1: use captions/descriptions/written text only — never invent audio transcription.
2. If multiple recipes appear, return each as a separate object in "recipes".
3. If no cover image URL exists, set cover_image_url to null and cover_fallback_label to a short uppercase 1–2 line title block.
4. action_header must be a short UPPERCASE cooking action (verb + object), e.g. PREP INGREDIENTS, SEAR CHICKEN, SIMMER SAUCE, ADD ONIONS. Never use filler fragments like TO THE SAME, TO THE VERY, IN A LARGE, OF THE PAN. Do not repeat the opening words of the instruction verbatim unless they are already a clear action phrase.
5. timer_seconds: integer seconds when a step implies a wait/cook duration; otherwise null.
6. Normalize ingredients with amount (number|null), unit (string|null), name, search_key (canonical singular food noun). When the source groups ingredients under headings (For the steak, For the salsa verde, Salad, etc.), set section on each item to that heading without the trailing colon. Duplicate names across sections (e.g. olive oil in marinade and salsa) are valid — keep every line in its section. ALWAYS keep unmeasured pantry lines: pinch, dash, splash, drizzle, handful, knob, "to taste". Use amount null and unit "pinch"/"dash"/null — never drop salt, pepper, or similar.
7. Generate 2–5 practical tags (e.g. Dinner, Pasta, Quick Meals, High Protein).
8. ids: recipe id as "rec_" + short slug; ingredient ids "ing_1", "ing_2", ...
9. is_favorite false; kitchen_notes [].
10. Always include numeric prep_time_minutes and servings_base (never null/omit).
11. Always include step_number as an integer on every step. Split the method into separate steps — one cooking action per step (blend, rest, pour, bake, etc.). Do not dump the whole caption into a single step. Omit yield, calorie, and protein recap lines from steps.
12. Use null (not omit) for unknown source_handle / source_url / cover_image_url.
13. NEVER invent ingredients or steps. Instagram/TikTok captions often list ingredients with emojis, shorthand (c, tbsp, g), and steps without "Ingredients"/"Directions" headers — still extract those. If a caption only names a dish or says "watch the video" with no list and no method, return {"recipes":[]}.
14. When the source has cooking steps but NO separate ingredient list (common on Instagram/TikTok), you MAY infer a shopping list from foods clearly used in the recipe. Include each distinct food ONCE — use the best amount/unit if stated anywhere in the caption. Do NOT emit a separate line every time a food is mentioned in directions (one cilantro line, not five). If amounts are unknown, use amount null. Do not guess foods that are not clearly part of the dish.
15. subtitle: when cover_image_url is null (no recipe photo), you MUST write a short single-sentence subtitle of five or six words (never fewer than four, never more than seven). Infer the flavor profile or general idea from the ingredients and directions (e.g. "Bright lemon garlic heat", "Slow-simmered and deeply savory"). Do not repeat the recipe title. Do not list ingredients. Do not use pantry templates like "five ingredients, built around X". Do not use generic filler (delicious, easy recipe, edit me). When a cover photo URL exists, set subtitle to null.
16. Strip list bullets (•, -, *) from ingredient names. Keep fractions like 1/2 in amount, not in the name.

17. Web pages: extract ONLY the recipe's edible ingredients and cooking directions. Ignore navigation, paywalls ("start trial"), pagination (previous/next), copyright years, privacy, terms, cookies, subscribe/newsletter, comments, related posts, author bios, and ads. If a line is not a food or a cooking step, omit it.
18. Pasted captions and messy text: ignore leading hype, hashtag blocks, "link in bio", emoji-only lines, and "watch the video". Keep informal ingredient shorthand (c, tbsp, g) and unnumbered steps.
19. Documents (PDF/text/markdown): if the file contains multiple distinct recipes, return each as a separate object in "recipes". Never keep only the first when others are complete. Never mash a cookbook chapter into one recipe.

Return ONLY valid JSON matching:
{ "recipes": [ { ...recipe } ] }`;

/** Photo OCR — do not use the caption/webpage prompt (it tells the model to return []). */
export const VISION_REQUIRED_FIELDS = [
  "title",
  "source_account",
  "ingredients",
  "instructions",
  "prep_time",
  "cook_time",
  "servings",
] as const;

export const VISION_SYSTEM_PROMPT = `You are RENDO's recipe photo reader.
Read every visible word in the attached image(s). These are photos of a recipe card, cookbook page, handwritten notes, or screenshot, already ordered first to last.

Aggregate text across ALL images into ONE recipe. Return ONLY JSON:
{"recipes":[{
  "title":"Dish name",
  "source_account":"@pasta_lab",
  "ingredients":[{"amount":1,"unit":"cup","name":"flour"},{"amount":2,"unit":null,"name":"eggs"}],
  "instructions":[{"step_number":1,"action_header":"MIX","instruction":"Mix until combined.","timer_seconds":null},{"step_number":2,"action_header":"BAKE","instruction":"Bake at 350F until golden.","timer_seconds":null}],
  "prep_time":25,
  "cook_time":40,
  "servings":4,
  "tags":["Dinner"],
  "subtitle":"Crisp roast with garlic",
  "source_url":null,
  "cover_image_url":null
}]}

Required fields on that single recipe object:
- title: Name of the recipe
- source_account: Instagram handle/creator source name (null if none is visible)
- ingredients: Array of items with parsed quantities and units ({amount, unit, name}; amount/unit null when unmeasured)
- instructions: Sequential step-by-step directions (array of {step_number, action_header, instruction, timer_seconds})
- prep_time: Extracted prep duration (if present) (integer minutes; null when not visible — do not invent)
- cook_time: Extracted cook duration (if present) (integer minutes; null when not visible — do not invent)
- servings: Parsed yield/yield count (if present) (number; null when not visible — do not invent)

Rules:
1. ingredients MUST be a JSON array of objects with parsed quantities and units — one ingredient per item, never one combined string.
2. instructions MUST be sequential step-by-step directions — a JSON array, one cooking action per item, never one combined string. action_header is a short UPPERCASE verb phrase.
3. Multiple photos are sequential pages of ONE recipe, in the order attached (Image 1 is first). Merge ingredients and steps in that order. If later frames repeat earlier lines (screenshot overlap), keep each unique line once.
4. recipes MUST contain exactly one object. Never one recipe per photo.
5. title is the name of the recipe. If it is unreadable, invent a short name from the dish — still return the ingredients and steps you can see.
6. If ANY ingredients or steps are visible, return them. Never return {"recipes":[]} when recipe text is in the photo.
7. Do not invent ingredients or steps that are not visible. Ignore likes, comments, follow buttons, and app chrome.
8. prep_time is the extracted prep duration if present; cook_time is the extracted cook duration if present (integer minutes). servings is the parsed yield/yield count if present. Use null when a duration or yield is not visible — do not invent one. source_account is the Instagram handle or creator name visible on the screenshot (@handle). Use null when none is visible. Use null for unknown source_url and cover_image_url.`;

export function buildVisionUserPrompt(input: {
  payload: string;
  imageCount: number;
}) {
  const count = Math.min(Math.max(input.imageCount, 1), 4);
  const order =
    count === 1
      ? "The attached photo is the recipe source. Read every visible ingredient and step."
      : Array.from({ length: count }, (_, index) => {
          const n = index + 1;
          return `Image ${n} of ${count} is page ${n} of the same recipe (capture order).`;
        }).join("\n");
  return `${
    count === 1
      ? "This photo is ONE recipe."
      : `These ${count} photos are sequential frames of ONE recipe.`
  }
${order}
Merge all visible text into a single structured JSON recipe with required fields title, source_account, ingredients, instructions, prep_time, cook_time, and servings. Do not invent missing steps. Do not split pages into multiple recipes.
Context:
${input.payload}`;
}

export function buildExtractionUserPrompt(input: {
  type: string;
  payload: string;
}) {
  const instagram =
    /instagram\.com|instagr\.am/i.test(input.payload)
      ? "\nThis source is an Instagram caption plus link. Extract the recipe from the caption text. Do not require a webpage scrape. If there is no ingredient list, infer one deduplicated shopping list from the foods used in the steps — each distinct food once, with the best amount if known.\n"
      : "";
  const webpage =
    input.type === "url" || input.type === "html"
      ? "\nThis is a webpage. Use only the Ingredients and Directions/Instructions/Method. Ignore navigation, trial CTAs, previous/next, copyright, privacy, terms, and comments.\n"
      : "";
  return `Source type: ${input.type}${instagram}${webpage}\nRaw content:\n${input.payload}`;
}

function nowIso() {
  return new Date().toISOString();
}

const UNMEASURED =
  /\b(pinch|pinches|dash|dashes|splash|drizzle|handful|knob|to taste)\b/i;
const YIELD_OR_NUTRITION =
  /^(makes\b|yields?\b|serves\b|about \d+\b|~?\d[\d.,]*\s*(cal|kcal|calories|g protein)|calories\b|protein\b)/i;

function cleanIngredientName(name: string) {
  return name
    .replace(/^[\s•·●○▪▫\-–—*]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function recoverUnmeasuredIngredients(
  ingredients: Ingredient[],
  sourceText?: string | null
): Ingredient[] {
  if (!sourceText) return ingredients;
  const have = new Set(
    ingredients.map((ing) => ing.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
  );
  const chunks = sourceText.split(/[\n•·●]+/);
  const extra: Ingredient[] = [];
  for (const chunk of chunks) {
    const line = cleanIngredientName(chunk);
    if (line.length < 4 || line.length > 80) continue;
    if (!UNMEASURED.test(line)) continue;
    if (/^(ingredients?|directions?|method|steps?)\b/i.test(line)) continue;
    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if ([...have].some((h) => h.includes(key) || key.includes(h))) continue;
    have.add(key);
    extra.push({
      id: `ing_${ingredients.length + extra.length + 1}`,
      amount: null,
      unit: null,
      name: line,
      search_key:
        line.toLowerCase().match(/\b(salt|pepper|sugar|oil)\b/)?.[1] ??
        line.toLowerCase().split(/\s+/).pop() ??
        "ingredient",
      checked: false,
    });
  }
  return extra.length ? [...ingredients, ...extra] : ingredients;
}

function splitPackedSteps(steps: RecipeStep[]): RecipeStep[] {
  if (!steps.length) return steps;
  const packed = steps.length <= 2;
  const expanded: RecipeStep[] = [];
  for (const step of steps) {
    const pieces = packed
      ? splitInstruction(step.instruction)
      : [step.instruction.trim()].filter(Boolean);
    if (pieces.length <= 1) {
      expanded.push({
        ...step,
        instruction: pieces[0] || step.instruction,
      });
      continue;
    }
    for (const piece of pieces) {
      expanded.push({
        step_number: expanded.length + 1,
        action_header: resolveActionHeader("", piece, expanded.length),
        instruction: piece,
        timer_seconds: null,
      });
    }
  }
  return expanded.map((step, i) => ({ ...step, step_number: i + 1 }));
}

function splitInstruction(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const numbered = cleaned.split(/(?:^|\s)\d+[\.\)]\s+/).map((s) => s.trim()).filter(Boolean);
  const parts = numbered.length > 1 ? numbered : cleaned.split(/(?<=[.!?])\s+(?=[A-Z“"])/);
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 8 && !YIELD_OR_NUTRITION.test(part));
}

export function decorateExtracted(
  recipe: ExtractedRecipe,
  sourceHint?: { url?: string | null; handle?: string | null },
  sourceText?: string | null,
  options?: { preserveOcrLines?: boolean }
) {
  const ts = nowIso();
  const sourceUrl =
    recipe.source_url?.trim() ||
    sourceHint?.url?.trim() ||
    null;
  const sourceHandle =
    recipe.source_handle?.trim() ||
    sourceHint?.handle?.trim() ||
    inferSourceHandle(sourceUrl, sourceHint?.handle) ||
    null;

  const hasPhoto = isUsableImageUrl(recipe.cover_image_url);
  const subtitle = recipe.subtitle_manual
    ? recipe.subtitle?.replace(/\s+/g, " ").trim() || null
    : hasPhoto
      ? null
      : validateGeminiSubtitle(recipe.subtitle, recipe.title);

  return {
    ...recipe,
    subtitle,
    subtitle_manual: Boolean(recipe.subtitle_manual),
    source_url: sourceUrl,
    source_handle: sourceHandle,
    is_favorite: recipe.is_favorite ?? false,
    cover_display: recipe.cover_display ?? (recipe.cover_image_url ? "photo" : "type"),
    tags: flattenTags(recipe.tags ?? []),
    kitchen_notes: recipe.kitchen_notes ?? [],
    cook_events: [],
    ingredients_normalized: (() => {
      const cleaned = recoverUnmeasuredIngredients(
        (recipe.ingredients_normalized ?? []).map((ing, i) => ({
          ...ing,
          id: ing.id || `ing_${i + 1}`,
          name: cleanIngredientName(ing.name),
          checked: ing.checked ?? false,
        })),
        sourceText
      ).filter((ing) => ing.name.trim());
      const kept = options?.preserveOcrLines
        ? cleaned
        : dedupeIngredientRecords(filterIngredientRecords(cleaned));
      return kept.map((ing, i) => ({ ...ing, id: `ing_${i + 1}` }));
    })(),
    steps: (() => {
      const split = splitPackedSteps(recipe.steps ?? []).filter((step) =>
        step.instruction.trim()
      );
      const kept = options?.preserveOcrLines
        ? split
        : filterStepRecords(split);
      return kept.map((step, i) => ({ ...step, step_number: i + 1 }));
    })(),
    created_at: recipe.created_at ?? ts,
    updated_at: recipe.updated_at ?? ts,
    last_opened_at: null,
    last_cooked_at: null,
  };
}

/** Prefer @handle for social URLs; otherwise the site hostname. */
export function inferSourceHandle(
  url?: string | null,
  handleHint?: string | null
): string | null {
  if (handleHint?.trim()) {
    const h = handleHint.trim();
    return h.startsWith("@") ? h : h.includes(".") ? h : `@${h}`;
  }
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "instagram.com" || host === "instagr.am") {
      const fromPath = parsed.pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
      if (fromPath && !["p", "reel", "reels", "tv", "stories"].includes(fromPath[1])) {
        return `@${fromPath[1]}`;
      }
      return "instagram.com";
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok.com";
    if (host === "youtube.com" || host === "youtu.be") return "youtube.com";
    return host || null;
  } catch {
    return null;
  }
}

/** Pull Source URL / @handle hints out of extraction payloads. */
export function sourceHintFromPayload(payload: string): {
  url: string | null;
  handle: string | null;
} {
  const url =
    payload.match(/^Source URL:\s*(\S+)/im)?.[1] ||
    payload.match(/https?:\/\/\S+/i)?.[0] ||
    null;
  const ig =
    payload.match(/^Instagram\s+(@[A-Za-z0-9._]+)/im)?.[1] ||
    payload.match(/\bInstagram\s+(@[A-Za-z0-9._]+)/i)?.[1] ||
    null;
  return {
    url,
    handle: ig || inferSourceHandle(url),
  };
}

export function mockExtractFromPayload(payload: string): ExtractedRecipe[] {
  const urlMatch = payload.match(/https?:\/\/\S+/i);
  const titleGuess =
    payload
      .split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          l.length > 3 &&
          !l.startsWith("http") &&
          !/^source url/i.test(l) &&
          !/^page title:/i.test(l) &&
          !/^title:/i.test(l) &&
          !/^file:/i.test(l)
      ) ??
    (urlMatch
      ? urlMatch[0].split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ")
      : null) ??
    "Imported Recipe";

  const title =
    titleGuess.replace(/^title:\s*/i, "").slice(0, 80) || "Imported Recipe";

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);

  return [
    {
      id: `rec_${slug || crypto.randomUUID().slice(0, 8)}`,
      title,
      subtitle: null,
      subtitle_manual: false,
      source_handle: null,
      source_url: urlMatch?.[0] ?? null,
      prep_time_minutes: 25,
      servings_base: 4,
      cover_image_url: null,
      cover_fallback_label: title.toUpperCase().slice(0, 24),
      cover_display: "type",
      is_favorite: false,
      tags: ["Quick Meals", "Dinner"],
      ingredients_normalized: [
        {
          id: "ing_1",
          amount: 1,
          unit: null,
          name: "primary ingredient (edit me)",
          search_key: "ingredient",
          checked: false,
        },
        {
          id: "ing_2",
          amount: 1,
          unit: "tbsp",
          name: "olive oil",
          search_key: "oil",
          checked: false,
        },
      ],
      steps: [
        {
          step_number: 1,
          action_header: "PREP INGREDIENTS",
          instruction:
            "Review extracted stub ingredients and adjust amounts before cooking.",
          timer_seconds: null,
        },
        {
          step_number: 2,
          action_header: "COOK",
          instruction:
            "Follow your source method. Re-run extraction with Gemini configured for fuller steps.",
          timer_seconds: 600,
        },
      ],
      kitchen_notes: [],
    },
  ];
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Vision duration fields (minutes or duration text). */
function parseDurationMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^(null|none|n\/a|-)$/i.test(trimmed)) return null;
  const iso = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (iso) {
    const total =
      Number(iso[1] || 0) * 60 +
      Number(iso[2] || 0) +
      Math.round(Number(iso[3] || 0) / 60);
    return total > 0 ? total : null;
  }
  const hours = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const mins = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i);
  if (hours || mins) {
    return (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function clampDurationMinutes(value: number): number {
  return Math.max(0, Math.min(12 * 60, Math.round(value)));
}

function asPrepTimeMinutes(value: unknown, fallback: number): number {
  const parsed = parseDurationMinutes(value);
  if (parsed == null) return fallback;
  return clampDurationMinutes(parsed);
}

/** Vision `cook_time` → stored cook_time_minutes (null when not present). */
function asOptionalDurationMinutes(value: unknown): number | null {
  const parsed = parseDurationMinutes(value);
  if (parsed == null) return null;
  return clampDurationMinutes(parsed);
}

/** Vision `servings` (yield count or "Serves 4") → stored servings_base. */
function parseServingsCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^(null|none|n\/a|-)$/i.test(trimmed)) return null;
  const range = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/i);
  if (range) return Number(range[1]);
  const match = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asServingsBase(value: unknown, fallback: number): number {
  const parsed = parseServingsCount(value);
  if (parsed == null) return fallback;
  return Math.max(1, parsed);
}

function asNullableString(value: unknown): string | null {
  if (typeof value === "string") return decodeHtmlEntities(value);
  return null;
}

/** Vision `source_account` → stored source_handle. */
function asSourceAccount(value: unknown): string | null {
  const raw = asNullableString(value)?.replace(/\s+/g, " ").trim() ?? "";
  if (!raw) return null;
  const first = raw.split(/[•|·,—]/)[0]?.trim() ?? raw;
  if (/^(follow|following|instagram|tiktok|facebook|youtube)$/i.test(first)) {
    return null;
  }
  const handle = first.match(/^@?([A-Za-z0-9._]{2,30})$/);
  if (handle) return `@${handle[1]}`;
  return first.slice(0, 60) || null;
}

function asCleanString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return decodeHtmlEntities(value.trim());
  }
  return fallback;
}

function asItemList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === "string" && /[\n•]/.test(item) ? splitBlobLines(item) : [item]
    );
  }
  if (typeof value === "string" && value.trim()) {
    return splitBlobLines(value);
  }
  return [];
}

function splitBlobLines(text: string): string[] {
  const numbered = text
    .split(/(?:^|\n)\s*\d+[\.\)]\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (numbered.length > 1) return numbered;
  return text
    .split(/\r?\n+|•|\u2022/)
    .map((line) => line.replace(/^[\s\-–—*]+/, "").trim())
    .filter((line) => line.length > 1);
}

function recipesFromLlm(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.recipes)) return obj.recipes;
  if (obj.recipe && typeof obj.recipe === "object") return [obj.recipe];
  if (
    obj.title ||
    obj.ingredients ||
    obj.ingredients_normalized ||
    obj.steps ||
    obj.instructions ||
    obj.directions
  ) {
    return [obj];
  }
  return [];
}

function coerceIngredient(ing: unknown, index: number) {
  if (typeof ing === "string") {
    const parsed = parseMeasuredIngredient(ing);
    const name = parsed.name || "ingredient";
    return {
      id: `ing_${index + 1}`,
      amount: parsed.amount,
      unit: parsed.unit,
      name,
      section: null,
      search_key: resolveSearchKey(name),
      checked: false,
    };
  }
  const row = (ing ?? {}) as Record<string, unknown>;
  const rawName = asCleanString(
    row.name ?? row.text ?? row.item ?? row.ingredient,
    ""
  );
  const parsed = parseMeasuredIngredient(rawName);
  const explicitAmount = coerceOptionalNumber(row.amount ?? row.quantity);
  const amount = explicitAmount ?? parsed.amount;
  const unit = asNullableString(row.unit)?.trim() || parsed.unit;
  const name =
    (explicitAmount != null && rawName ? rawName : parsed.name) ||
    rawName ||
    "ingredient";
  const explicitKey =
    typeof row.search_key === "string" && row.search_key.trim()
      ? decodeHtmlEntities(row.search_key.trim())
      : null;
  return {
    id:
      typeof row.id === "string" && row.id.trim()
        ? row.id
        : `ing_${index + 1}`,
    amount,
    unit: unit || null,
    name,
    section: asNullableString(row.section),
    search_key: resolveSearchKey(name, explicitKey),
    checked: Boolean(row.checked),
  };
}

function coerceOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const INGREDIENT_UNITS = new Set([
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
  "pinch",
  "pinches",
  "dash",
  "dashes",
]);

function parseMeasuredIngredient(line: string): {
  amount: number | null;
  unit: string | null;
  name: string;
} {
  const cleaned = decodeHtmlEntities(line.replace(/^[\s•\-–—*]+/, "").trim());
  if (!cleaned) return { amount: null, unit: null, name: "" };
  const match = cleaned.match(
    /^((?:\d+\s+\d+\/\d+)|\d+\/\d+|\d+\.\d+|\d+)?\s*(.*)$/
  );
  const amountRaw = match?.[1]?.trim() || "";
  let rest = (match?.[2] || cleaned).trim();
  let amount: number | null = null;
  if (amountRaw) {
    amount = 0;
    for (const part of amountRaw.split(/\s+/)) {
      if (part.includes("/")) {
        const [a, b] = part.split("/").map(Number);
        if (b) amount += a / b;
      } else {
        const n = Number(part);
        if (Number.isFinite(n)) amount += n;
      }
    }
    if (!Number.isFinite(amount) || amount <= 0) amount = null;
  }
  let unit: string | null = null;
  const unitMatch = rest.match(/^([A-Za-z]+)\b\s*(.*)$/);
  if (unitMatch && INGREDIENT_UNITS.has(unitMatch[1].toLowerCase())) {
    unit = unitMatch[1].toLowerCase();
    rest = unitMatch[2].trim();
  }
  return { amount, unit, name: rest || cleaned };
}

function coerceStep(step: unknown, index: number) {
  if (typeof step === "string") {
    const instruction = decodeHtmlEntities(step.trim());
    return {
      step_number: index + 1,
      action_header: resolveActionHeader("", instruction, index),
      instruction,
      timer_seconds: null,
    };
  }
  const row = (step ?? {}) as Record<string, unknown>;
  const instruction = asCleanString(
    typeof row.instruction === "string"
      ? row.instruction
      : typeof row.text === "string"
        ? row.text
        : typeof row.name === "string"
          ? row.name
          : "",
    "",
  );
  const rawHeader =
    typeof row.action_header === "string" && row.action_header.trim()
      ? decodeHtmlEntities(row.action_header)
      : typeof row.actionHeader === "string" && row.actionHeader.trim()
        ? decodeHtmlEntities(row.actionHeader)
        : "";
  return {
    step_number: Math.max(
      1,
      Math.round(asNumber(row.step_number ?? row.stepNumber, index + 1)),
    ),
    action_header: resolveActionHeader(rawHeader, instruction, index),
    instruction,
    timer_seconds:
      row.timer_seconds == null && row.timerSeconds == null
        ? null
        : Math.max(
            0,
            Math.round(asNumber(row.timer_seconds ?? row.timerSeconds, 0)),
          ),
  };
}

/** Gemini often omits/nulls optional fields — coerce before Zod. */
function normalizeLlmRecipe(raw: Record<string, unknown>, index: number) {
  const title = asCleanString(raw.title, `Recipe ${index + 1}`);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);

  const ingredientsRaw = asItemList(
    raw.ingredients ?? raw.ingredients_normalized ?? raw.ingredient_list
  );

  const stepsRaw = asItemList(
    raw.instructions ?? raw.steps ?? raw.directions ?? raw.method
  );

  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id
        : `rec_${slug || index + 1}`,
    title,
    subtitle: validateGeminiSubtitle(
      typeof raw.subtitle === "string" ? raw.subtitle : null,
      title
    ),
    subtitle_manual: false,
    source_handle: asSourceAccount(raw.source_account ?? raw.source_handle),
    source_url: asNullableString(raw.source_url),
    prep_time_minutes: asPrepTimeMinutes(
      raw.prep_time ?? raw.prep_time_minutes ?? raw.prepTime,
      25,
    ),
    cook_time_minutes: asOptionalDurationMinutes(
      raw.cook_time ?? raw.cook_time_minutes ?? raw.cookTime,
    ),
    servings_base: asServingsBase(
      raw.servings ?? raw.servings_base ?? raw.yield ?? raw.recipeYield,
      4,
    ),
    cover_image_url: asNullableString(raw.cover_image_url),
    cover_fallback_label:
      asNullableString(raw.cover_fallback_label) ??
      title.toUpperCase().slice(0, 24),
    cover_display: raw.cover_display ?? (raw.cover_image_url ? "photo" : "type"),
    is_favorite: Boolean(raw.is_favorite),
    tags: Array.isArray(raw.tags)
      ? flattenTags(
          raw.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => decodeHtmlEntities(t))
        )
      : [],
    ingredients_normalized: ingredientsRaw.map((ing, i) =>
      coerceIngredient(ing, i)
    ),
    steps: stepsRaw.map((step, i) => coerceStep(step, i)),
    kitchen_notes: Array.isArray(raw.kitchen_notes) ? raw.kitchen_notes : [],
  };
}

export function parseExtractionJson(raw: string) {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  const recipes = recipesFromLlm(parsed);
  const normalized = {
    recipes: recipes.map((recipe, index) =>
      normalizeLlmRecipe((recipe ?? {}) as Record<string, unknown>, index),
    ),
  };
  return ExtractResponseSchema.parse(normalized);
}

const MediaItemSchema = z.object({
  mimeType: z.string().min(3),
  data: z.string().min(1),
});

export const ExtractRequestSchema = z.object({
  type: z.enum(["url", "ocr", "upload", "document", "text", "html"]),
  payload: z.string().min(1),
  media: z.preprocess(
    (value) => {
      if (value == null) return undefined;
      const list = Array.isArray(value) ? value : [value];
      return list.length ? list.slice(0, 4) : undefined;
    },
    z.array(MediaItemSchema).max(4).optional()
  ),
});
