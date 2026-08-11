import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  fetchUrlSource,
  structuredFromPlainText,
} from "@/lib/extract/fetch-url";
import {
  buildExtractionUserPrompt,
  decorateExtracted,
  EXTRACTION_SYSTEM_PROMPT,
  mockExtractFromPayload,
  parseExtractionJson,
} from "@/lib/extract/schema";
import type { Recipe } from "@/lib/db/types";

/**
 * 2.5 / 2.0 Flash are blocked for new API keys — use Gemini 3.x Flash.
 * Override with GEMINI_MODEL if needed.
 */
const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
].filter((m): m is string => Boolean(m));

export type ExtractMedia = {
  mimeType: string;
  data: string; // base64, no data: prefix
};

export async function extractRecipes(input: {
  type: string;
  payload: string;
  media?: ExtractMedia | null;
}): Promise<{
  recipes: Recipe[];
  mode: "gemini" | "structured" | "mock";
  warning?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  let workingPayload = input.payload;
  let media = input.media ?? null;
  let structuredRecipe: ReturnType<typeof structuredFromPlainText>;

  if (input.type === "url") {
    const url =
      input.payload.match(/https?:\/\/\S+/i)?.[0] ?? input.payload.trim();
    try {
      const source = await fetchUrlSource(url);
      structuredRecipe = source.structured;
      workingPayload = [
        `Source URL: ${source.url}`,
        source.title ? `Page title: ${source.title}` : null,
        "",
        source.text,
      ]
        .filter(Boolean)
        .join("\n");

      // Prefer structured JSON-LD / plain parse — works even when Gemini is down.
      if (structuredRecipe) {
        return {
          recipes: [decorateExtracted(structuredRecipe)],
          mode: "structured",
        };
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Couldn’t fetch that recipe link.";
      return {
        recipes: [],
        mode: "mock",
        warning: message,
      };
    }
  } else if (input.type === "text" || input.type === "document") {
    structuredRecipe = structuredFromPlainText(
      workingPayload,
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ?? "https://rendo.local/import"
    );
  }

  if (!workingPayload.trim()) {
    return {
      recipes: [],
      mode: "mock",
      warning: "Nothing to extract. Paste a recipe link or recipe text.",
    };
  }

  if (!apiKey) {
    if (structuredRecipe) {
      return {
        recipes: [decorateExtracted(structuredRecipe)],
        mode: "structured",
        warning: "GEMINI_API_KEY is not set — used page recipe data instead.",
      };
    }
    return {
      recipes: [],
      mode: "mock",
      warning:
        "GEMINI_API_KEY is not set. For links, use a recipe page with ingredients listed, or Paste Recipe Text.",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const promptParts: Array<{ text: string } | { inlineData: ExtractMedia }> = [
    { text: EXTRACTION_SYSTEM_PROMPT },
    {
      text: buildExtractionUserPrompt({
        type: input.type,
        payload: workingPayload,
      }),
    },
  ];

  if (media?.data && media.mimeType) {
    promptParts.push({
      text: "The attached media is the recipe source (photo, scan, or document). Extract from it.",
    });
    promptParts.push({
      inlineData: {
        mimeType: media.mimeType,
        data: media.data,
      },
    });
  }

  const errors: string[] = [];

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const result = await model.generateContent(promptParts);
      const text = result.response.text();
      const parsed = parseExtractionJson(text);
      return {
        recipes: parsed.recipes.map(decorateExtracted),
        mode: "gemini",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gemini request failed";
      errors.push(`${modelName}: ${sanitizeGeminiError(message)}`);
    }
  }

  // Gemini failed — use structured page data if we have it; never save a junk stub.
  if (structuredRecipe) {
    return {
      recipes: [decorateExtracted(structuredRecipe)],
      mode: "structured",
      warning: `Saved from page recipe data (Gemini unavailable).`,
    };
  }

  const heuristic = structuredFromPlainText(
    workingPayload,
    workingPayload.match(/https?:\/\/\S+/i)?.[0] ?? "https://rendo.local/import"
  );
  if (heuristic) {
    return {
      recipes: [decorateExtracted(heuristic)],
      mode: "structured",
      warning: `Saved a best-effort parse (Gemini unavailable).`,
    };
  }

  // Keep mock only for non-URL image/OCR experiments when nothing structured exists.
  if (input.type === "ocr" || input.type === "upload") {
    return {
      recipes: mockExtractFromPayload(workingPayload).map(decorateExtracted),
      mode: "mock",
      warning: `Gemini failed — ${errors.join(" | ")}. Fell back to mock extraction.`,
    };
  }

  return {
    recipes: [],
    mode: "mock",
    warning: geminiFailureMessage(errors),
  };
}

function sanitizeGeminiError(message: string): string {
  if (/API key not valid|API_KEY_INVALID/i.test(message)) {
    return "API key not valid on this deploy";
  }
  if (/400 Bad Request/i.test(message)) {
    return "400 Bad Request";
  }
  return message.length > 160 ? `${message.slice(0, 160)}…` : message;
}

function geminiFailureMessage(errors: string[]): string {
  const joined = errors.join(" | ");
  if (/API key not valid|API_KEY_INVALID/i.test(joined)) {
    return "Gemini API key on Netlify is invalid. Update GEMINI_API_KEY, or use Paste Recipe Text / Paste Link (page reader).";
  }
  return `Couldn't extract a full recipe (${errors[0] ?? "Gemini failed"}). Try Paste Recipe Text.`;
}
