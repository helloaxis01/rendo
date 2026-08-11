import { GoogleGenerativeAI } from "@google/generative-ai";
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

export async function extractRecipes(input: {
  type: string;
  payload: string;
}): Promise<{
  recipes: Recipe[];
  mode: "gemini" | "mock";
  warning?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return {
      recipes: mockExtractFromPayload(input.payload).map(decorateExtracted),
      mode: "mock",
      warning:
        "GEMINI_API_KEY is not set — using mock extraction. Add the key in .env.local / Netlify and restart.",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = [
    { text: EXTRACTION_SYSTEM_PROMPT },
    { text: buildExtractionUserPrompt(input) },
  ];

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

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseExtractionJson(text);
      return {
        recipes: parsed.recipes.map(decorateExtracted),
        mode: "gemini",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gemini request failed";
      errors.push(`${modelName}: ${message}`);
    }
  }

  return {
    recipes: mockExtractFromPayload(input.payload).map(decorateExtracted),
    mode: "mock",
    warning: `Gemini failed — ${errors.join(" | ")}. Fell back to mock extraction.`,
  };
}
