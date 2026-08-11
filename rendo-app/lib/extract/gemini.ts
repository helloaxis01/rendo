import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchUrlSource } from "@/lib/extract/fetch-url";
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
  mode: "gemini" | "mock";
  warning?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  let workingPayload = input.payload;
  let media = input.media ?? null;
  const warnings: string[] = [];

  if (input.type === "url") {
    const url = input.payload.match(/https?:\/\/\S+/i)?.[0] ?? input.payload.trim();
    try {
      const source = await fetchUrlSource(url);
      workingPayload = [
        `Source URL: ${source.url}`,
        source.title ? `Page title: ${source.title}` : null,
        "",
        source.text,
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Couldn’t fetch that recipe link.";
      // Don't invent a stub recipe from a blocked URL — ask the user to paste text.
      return {
        recipes: [],
        mode: "mock",
        warning: message,
      };
    }
  }

  if (!workingPayload.trim()) {
    return {
      recipes: [],
      mode: "mock",
      warning: "Nothing to extract. Paste a recipe link or recipe text.",
    };
  }

  if (!apiKey) {
    return {
      recipes: mockExtractFromPayload(workingPayload).map(decorateExtracted),
      mode: "mock",
      warning:
        warnings[0] ??
        "GEMINI_API_KEY is not set — using mock extraction. Add the key in .env.local / Netlify and restart.",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const promptParts: Array<{ text: string } | { inlineData: ExtractMedia }> = [
    { text: EXTRACTION_SYSTEM_PROMPT },
    { text: buildExtractionUserPrompt({ type: input.type, payload: workingPayload }) },
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
        warning: warnings.length ? warnings.join(" ") : undefined,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gemini request failed";
      errors.push(`${modelName}: ${message}`);
    }
  }

  return {
    recipes: mockExtractFromPayload(workingPayload).map(decorateExtracted),
    mode: "mock",
    warning: `Gemini failed — ${errors.join(" | ")}. Fell back to mock extraction.`,
  };
}
