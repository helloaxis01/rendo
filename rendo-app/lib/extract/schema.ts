import { z } from "zod";
import {
  ExtractResponseSchema,
  type ExtractedRecipe,
} from "@/lib/db/types";
import { resolveActionHeader } from "@/lib/extract/action-header";
import { decodeHtmlEntities } from "@/lib/text/html-entities";
import { normalizeSubtitle, pickSourceSubtitle } from "@/lib/extract/subtitle";

export const EXTRACTION_SYSTEM_PROMPT = `You are RENDO's recipe extraction engine.
Strip ALL fluff: personal essays, memoirs, ad copy, video banter, SEO filler.
Save ONLY functional cooking facts: title, times, servings, ingredients with amounts/units, numbered steps with uppercase action headers, tags, source handle/url when present.

Rules:
1. Phase 1: use captions/descriptions/written text only — never invent audio transcription.
2. If multiple recipes appear, return each as a separate object in "recipes".
3. If no cover image URL exists, set cover_image_url to null and cover_fallback_label to a short uppercase 1–2 line title block.
4. action_header must be a short UPPERCASE cooking action (verb + object), e.g. PREP INGREDIENTS, SEAR CHICKEN, SIMMER SAUCE, ADD ONIONS. Never use filler fragments like TO THE SAME, TO THE VERY, IN A LARGE, OF THE PAN. Do not repeat the opening words of the instruction verbatim unless they are already a clear action phrase.
5. timer_seconds: integer seconds when a step implies a wait/cook duration; otherwise null.
6. Normalize ingredients with amount (number|null), unit (string|null), name, search_key (canonical singular food noun).
7. Generate 2–5 practical tags (e.g. Dinner, Pasta, Quick Meals, High Protein).
8. ids: recipe id as "rec_" + short slug; ingredient ids "ing_1", "ing_2", ...
9. is_favorite false; kitchen_notes [].
10. Always include numeric prep_time_minutes and servings_base (never null/omit).
11. Always include step_number as an integer on every step.
12. Use null (not omit) for unknown source_handle / source_url / cover_image_url.
13. NEVER invent ingredients or steps. If a social caption only names a dish / teases a recipe without listing ingredients and method, return {"recipes":[]}.
14. subtitle: one short line in the original author’s voice, paraphrased from the caption/headnote/intro (not a verbatim quote, not a pantry template like "five ingredients, built around X"). Use null if the source has no distinctive description.

Return ONLY valid JSON matching:
{ "recipes": [ { ...recipe } ] }`;

export function buildExtractionUserPrompt(input: {
  type: string;
  payload: string;
}) {
  return `Source type: ${input.type}\n\nRaw content:\n${input.payload}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function decorateExtracted(
  recipe: ExtractedRecipe,
  sourceHint?: { url?: string | null; handle?: string | null },
  sourceText?: string | null
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

  const subtitle = recipe.subtitle_manual
    ? normalizeSubtitle(recipe.subtitle) ?? (recipe.subtitle?.trim() || null)
    : normalizeSubtitle(recipe.subtitle) ?? pickSourceSubtitle(sourceText);

  return {
    ...recipe,
    subtitle,
    subtitle_manual: Boolean(recipe.subtitle_manual),
    source_url: sourceUrl,
    source_handle: sourceHandle,
    is_favorite: recipe.is_favorite ?? false,
    cover_display: recipe.cover_display ?? (recipe.cover_image_url ? "photo" : "type"),
    tags: recipe.tags ?? [],
    kitchen_notes: recipe.kitchen_notes ?? [],
    ingredients_normalized: (recipe.ingredients_normalized ?? []).map((ing) => ({
      ...ing,
      checked: ing.checked ?? false,
    })),
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

  const subtitle = pickSourceSubtitle(payload);

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);

  return [
    {
      id: `rec_${slug || crypto.randomUUID().slice(0, 8)}`,
      title,
      subtitle,
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

function asNullableString(value: unknown): string | null {
  if (typeof value === "string") return decodeHtmlEntities(value);
  return null;
}

function asCleanString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return decodeHtmlEntities(value.trim());
  }
  return fallback;
}

/** Gemini often omits/nulls optional fields — coerce before Zod. */
function normalizeLlmRecipe(raw: Record<string, unknown>, index: number) {
  const title = asCleanString(raw.title, `Recipe ${index + 1}`);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);

  const ingredientsRaw = Array.isArray(raw.ingredients_normalized)
    ? raw.ingredients_normalized
    : Array.isArray(raw.ingredients)
      ? raw.ingredients
      : [];

  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];

  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id
        : `rec_${slug || index + 1}`,
    title,
    subtitle: normalizeSubtitle(
      typeof raw.subtitle === "string" ? raw.subtitle : null
    ),
    subtitle_manual: false,
    source_handle: asNullableString(raw.source_handle),
    source_url: asNullableString(raw.source_url),
    prep_time_minutes: Math.max(
      0,
      Math.min(12 * 60, Math.round(asNumber(raw.prep_time_minutes, 25))),
    ),
    servings_base: Math.max(1, asNumber(raw.servings_base, 4)),
    cover_image_url: asNullableString(raw.cover_image_url),
    cover_fallback_label:
      asNullableString(raw.cover_fallback_label) ??
      title.toUpperCase().slice(0, 24),
    cover_display: raw.cover_display ?? (raw.cover_image_url ? "photo" : "type"),
    is_favorite: Boolean(raw.is_favorite),
    tags: Array.isArray(raw.tags)
      ? raw.tags
          .filter((t): t is string => typeof t === "string")
          .map((t) => decodeHtmlEntities(t))
      : [],
    ingredients_normalized: ingredientsRaw.map((ing, i) => {
      const row = (ing ?? {}) as Record<string, unknown>;
      return {
        id:
          typeof row.id === "string" && row.id.trim()
            ? row.id
            : `ing_${i + 1}`,
        amount:
          typeof row.amount === "number"
            ? row.amount
            : typeof row.amount === "string" && row.amount.trim()
              ? Number(row.amount) || null
              : null,
        unit: asNullableString(row.unit),
        name: asCleanString(row.name, "ingredient"),
        search_key:
          typeof row.search_key === "string" && row.search_key.trim()
            ? decodeHtmlEntities(row.search_key.trim())
            : typeof row.name === "string"
              ? decodeHtmlEntities(row.name).toLowerCase().split(/\s+/).pop() ||
                "ingredient"
              : "ingredient",
        checked: Boolean(row.checked),
      };
    }),
    steps: stepsRaw.map((step, i) => {
      const row = (step ?? {}) as Record<string, unknown>;
      const instruction = asCleanString(
        typeof row.instruction === "string"
          ? row.instruction
          : typeof row.text === "string"
            ? row.text
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
          Math.round(asNumber(row.step_number ?? row.stepNumber, i + 1)),
        ),
        action_header: resolveActionHeader(rawHeader, instruction, i),
        instruction,
        timer_seconds:
          row.timer_seconds == null && row.timerSeconds == null
            ? null
            : Math.max(
                0,
                Math.round(asNumber(row.timer_seconds ?? row.timerSeconds, 0)),
              ),
      };
    }),
    kitchen_notes: Array.isArray(raw.kitchen_notes) ? raw.kitchen_notes : [],
  };
}

export function parseExtractionJson(raw: string) {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as { recipes?: unknown };
  const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
  const normalized = {
    recipes: recipes.map((recipe, index) =>
      normalizeLlmRecipe((recipe ?? {}) as Record<string, unknown>, index),
    ),
  };
  return ExtractResponseSchema.parse(normalized);
}

export const ExtractRequestSchema = z.object({
  type: z.enum(["url", "ocr", "upload", "document", "text", "html"]),
  payload: z.string().min(1),
  media: z
    .object({
      mimeType: z.string().min(3),
      data: z.string().min(1),
    })
    .optional()
    .nullable(),
});
