import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  buildExtractionUserPrompt,
  decorateExtracted,
  EXTRACTION_SYSTEM_PROMPT,
  mockExtractFromPayload,
  parseExtractionJson,
} from "@/lib/extract/schema";
import type { Recipe } from "@/lib/db/types";

export async function extractRecipes(input: {
  type: string;
  payload: string;
}): Promise<{ recipes: Recipe[]; mode: "gemini" | "mock" }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      recipes: mockExtractFromPayload(input.payload).map(decorateExtracted),
      mode: "mock",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const result = await model.generateContent([
    { text: EXTRACTION_SYSTEM_PROMPT },
    { text: buildExtractionUserPrompt(input) },
  ]);

  const text = result.response.text();
  const parsed = parseExtractionJson(text);
  return {
    recipes: parsed.recipes.map(decorateExtracted),
    mode: "gemini",
  };
}
