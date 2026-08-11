import { z } from "zod";
import {
  ExtractResponseSchema,
  type ExtractedRecipe,
} from "@/lib/db/types";

export const EXTRACTION_SYSTEM_PROMPT = `You are RENDO's recipe extraction engine.
Strip ALL fluff: personal essays, memoirs, ad copy, video banter, SEO filler.
Save ONLY functional cooking facts: title, times, servings, ingredients with amounts/units, numbered steps with uppercase action headers, tags, source handle/url when present.

Rules:
1. Phase 1: use captions/descriptions/written text only — never invent audio transcription.
2. If multiple recipes appear, return each as a separate object in "recipes".
3. If no cover image URL exists, set cover_image_url to null and cover_fallback_label to a short uppercase 1–2 line title block.
4. action_header must be UPPERCASE terse verbs (e.g. PREP INGREDIENTS, SEAR CHICKEN).
5. timer_seconds: integer seconds when a step implies a wait/cook duration; otherwise null.
6. Normalize ingredients with amount (number|null), unit (string|null), name, search_key (canonical singular food noun).
7. Generate 2–5 practical tags (e.g. Dinner, Pasta, Quick Meals, High Protein).
8. ids: recipe id as "rec_" + short slug; ingredient ids "ing_1", "ing_2", ...
9. is_favorite false; kitchen_notes [].
10. Always include numeric prep_time_minutes and servings_base (never null/omit).
11. Always include step_number as an integer on every step.
12. Use null (not omit) for unknown source_handle / source_url / cover_image_url.

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

export function decorateExtracted(recipe: ExtractedRecipe) {
  const ts = nowIso();
  return {
    ...recipe,
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
  };
}

export function mockExtractFromPayload(payload: string): ExtractedRecipe[] {
  const urlMatch = payload.match(/https?:\/\/\S+/i);
  const titleGuess =
    payload
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 3 && !l.startsWith("http")) ??
    "Imported Recipe";

  const slug = titleGuess
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);

  return [
    {
      id: `rec_${slug || crypto.randomUUID().slice(0, 8)}`,
      title: titleGuess.slice(0, 80),
      source_handle: null,
      source_url: urlMatch?.[0] ?? null,
      prep_time_minutes: 25,
      servings_base: 4,
      cover_image_url: null,
      cover_fallback_label: titleGuess.toUpperCase().slice(0, 24),
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
  if (typeof value === "string") return value;
  return null;
}

/** Gemini often omits/nulls optional fields — coerce before Zod. */
function normalizeLlmRecipe(raw: Record<string, unknown>, index: number) {
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : `Recipe ${index + 1}`;
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
    source_handle: asNullableString(raw.source_handle),
    source_url: asNullableString(raw.source_url),
    prep_time_minutes: Math.max(0, Math.round(asNumber(raw.prep_time_minutes, 25))),
    servings_base: Math.max(1, asNumber(raw.servings_base, 4)),
    cover_image_url: asNullableString(raw.cover_image_url),
    cover_fallback_label:
      asNullableString(raw.cover_fallback_label) ??
      title.toUpperCase().slice(0, 24),
    cover_display: raw.cover_display ?? (raw.cover_image_url ? "photo" : "type"),
    is_favorite: Boolean(raw.is_favorite),
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string")
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
        name:
          typeof row.name === "string" && row.name.trim()
            ? row.name
            : "ingredient",
        search_key:
          typeof row.search_key === "string" && row.search_key.trim()
            ? row.search_key
            : typeof row.name === "string"
              ? row.name.toLowerCase().split(/\s+/).pop() || "ingredient"
              : "ingredient",
        checked: Boolean(row.checked),
      };
    }),
    steps: stepsRaw.map((step, i) => {
      const row = (step ?? {}) as Record<string, unknown>;
      return {
        step_number: Math.max(
          1,
          Math.round(asNumber(row.step_number ?? row.stepNumber, i + 1)),
        ),
        action_header:
          typeof row.action_header === "string" && row.action_header.trim()
            ? row.action_header.toUpperCase()
            : typeof row.actionHeader === "string" && row.actionHeader.trim()
              ? row.actionHeader.toUpperCase()
              : `STEP ${i + 1}`,
        instruction:
          typeof row.instruction === "string" && row.instruction.trim()
            ? row.instruction
            : typeof row.text === "string"
              ? row.text
              : "",
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
  type: z.enum(["url", "ocr", "upload", "document", "text"]),
  payload: z.string().min(1),
});
