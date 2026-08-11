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

export function parseExtractionJson(raw: string) {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  return ExtractResponseSchema.parse(parsed);
}

export const ExtractRequestSchema = z.object({
  type: z.enum(["url", "ocr", "upload", "document", "text"]),
  payload: z.string().min(1),
});
