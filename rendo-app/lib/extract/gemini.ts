import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  fetchUrlSource,
  parseRecipeFromHtml,
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

/** After an invalid-key response, skip further Gemini calls for this server instance. */
let geminiDisabledMessage: string | null = null;

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
  const media = input.media ?? null;
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
  } else if (input.type === "html") {
    const url =
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
      "https://rendo.local/import";
    const htmlMatch = workingPayload.match(/<!DOCTYPE html|<html[\s>]/i);
    const html = htmlMatch
      ? workingPayload.slice(htmlMatch.index)
      : workingPayload;
    const parsed = parseRecipeFromHtml(html, url);
    if (parsed?.structured) {
      return {
        recipes: [decorateExtracted(parsed.structured)],
        mode: "structured",
      };
    }
    structuredRecipe = parsed?.structured;
    workingPayload = [
      `Source URL: ${url}`,
      parsed?.title ? `Page title: ${parsed.title}` : null,
      "",
      (parsed?.text ?? html.replace(/<[^>]+>/g, " ")).slice(0, 40000),
    ]
      .filter(Boolean)
      .join("\n");
    if (!structuredRecipe) {
      structuredRecipe = structuredFromPlainText(workingPayload, url);
    }
    if (structuredRecipe) {
      return {
        recipes: [decorateExtracted(structuredRecipe)],
        mode: "structured",
      };
    }
  } else if (input.type === "text" || input.type === "document") {
    structuredRecipe = structuredFromPlainText(
      workingPayload,
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
        "https://rendo.local/import"
    );
    if (structuredRecipe) {
      return {
        recipes: [decorateExtracted(structuredRecipe)],
        mode: "structured",
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

  const skipGemini = Boolean(geminiDisabledMessage) || !apiKey;

  if (skipGemini) {
    if (structuredRecipe) {
      return {
        recipes: [decorateExtracted(structuredRecipe)],
        mode: "structured",
        warning: geminiDisabledMessage ?? undefined,
      };
    }
    const heuristic = structuredFromPlainText(
      workingPayload,
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
        "https://rendo.local/import"
    );
    if (heuristic) {
      return {
        recipes: [decorateExtracted(heuristic)],
        mode: "structured",
        warning: geminiDisabledMessage ?? undefined,
      };
    }
    return {
      recipes: [],
      mode: "mock",
      warning:
        geminiDisabledMessage ??
        "GEMINI_API_KEY is not set. Use Paste Recipe Text, or set a valid key on Netlify.",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey!);
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

  let sawModelError = false;

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
      if (isInvalidApiKeyError(message)) {
        geminiDisabledMessage =
          "Gemini API key on Netlify is invalid. Set GEMINI_API_KEY to your AQ… key, then clear cache & deploy.";
        break;
      }
      sawModelError = true;
    }
  }

  if (structuredRecipe) {
    return {
      recipes: [decorateExtracted(structuredRecipe)],
      mode: "structured",
      warning: geminiDisabledMessage ?? "Saved from page recipe data.",
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
      warning: geminiDisabledMessage ?? "Saved a best-effort parse.",
    };
  }

  if (input.type === "ocr" || input.type === "upload") {
    return {
      recipes: mockExtractFromPayload(workingPayload).map(decorateExtracted),
      mode: "mock",
      warning:
        geminiDisabledMessage ??
        "Couldn't read that image with Gemini. Try Paste Recipe Text.",
    };
  }

  // Last resort: keep a rough recipe rather than failing the import entirely.
  const rough = mockExtractFromPayload(workingPayload).map(decorateExtracted);
  if (rough.length && workingPayload.trim().length > 80) {
    return {
      recipes: rough,
      mode: "mock",
      warning:
        geminiDisabledMessage ??
        (sawModelError
          ? "Saved a rough import — edit ingredients/steps as needed."
          : "Saved a rough import — edit as needed."),
    };
  }

  return {
    recipes: [],
    mode: "mock",
    warning:
      geminiDisabledMessage ??
      (sawModelError
        ? "Couldn't extract with Gemini. Try Paste Recipe Text."
        : "Couldn't extract a recipe. Try Paste Recipe Text."),
  };
}

function isInvalidApiKeyError(message: string): boolean {
  return /API_KEY_INVALID|API key not valid|invalid api key|400 Bad Request.*API|generateContent: \[400/i.test(
    message
  );
}
