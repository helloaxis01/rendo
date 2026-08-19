import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  fetchUrlSource,
  parseRecipeFromHtml,
  structuredFromPlainText,
} from "@/lib/extract/fetch-url";
import { clipToRecipeBody } from "@/lib/extract/clean-recipe";
import {
  isInstagramUrl,
  isSocialWithoutUsableCaption,
  payloadHasInstagramUrl,
  payloadHasSocialPostUrl,
} from "@/lib/extract/instagram";
import {
  buildExtractionUserPrompt,
  decorateExtracted,
  EXTRACTION_SYSTEM_PROMPT,
  VISION_SYSTEM_PROMPT,
  parseExtractionJson,
  sourceHintFromPayload,
} from "@/lib/extract/schema";
import type { ExtractedRecipe, Ingredient, Recipe, RecipeStep } from "@/lib/db/types";
import { isUsableImageUrl } from "@/lib/cover";
import { needsGeminiSubtitle, validateGeminiSubtitle } from "@/lib/extract/subtitle";
import {
  REQUIRES_PASTE,
  notEnoughInfoMessage,
  type ExtractStatus,
  type NotEnoughSource,
} from "@/lib/extract/status";
import { isWeakRecipe, stitchVisionRecipes } from "@/lib/extract/quality";
import { visionBatchMedia, visionBatchPromptParts } from "@/lib/capture/vision-batch";
import { VISION_RESPONSE_SCHEMA } from "@/lib/extract/vision-schema";

type ExtractResult = {
  recipes: Recipe[];
  mode: "gemini" | "structured" | "mock";
  warning?: string;
  status?: ExtractStatus;
  message?: string;
};

/**
 * 2.5 / 2.0 Flash are blocked for new API keys — use Gemini 3.x Flash.
 * Override with GEMINI_MODEL if needed. Vision tries lite first (faster OCR).
 */
const TEXT_MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
].filter((m): m is string => Boolean(m));

const VISION_MODEL_CANDIDATES = [
  "gemini-3.5-flash-lite",
  process.env.GEMINI_MODEL,
  "gemini-3.5-flash",
  "gemini-3.6-flash",
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
  media?: ExtractMedia | ExtractMedia[] | null;
}): Promise<ExtractResult> {
  const result = await extractRecipesCore(input);
  if (!result.recipes.length) return result;
  // Vision already uses most of the 60s function budget.
  if (visionBatchMedia(input.media).length) return result;
  return {
    ...result,
    recipes: await Promise.all(
      result.recipes.map((recipe) => ensurePhotolessSubtitle(recipe))
    ),
  };
}

async function extractRecipesCore(input: {
  type: string;
  payload: string;
  media?: ExtractMedia | ExtractMedia[] | null;
}): Promise<ExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  let workingPayload = input.payload;
  const mediaList = visionBatchMedia(input.media);
  let structuredRecipe: ReturnType<typeof structuredFromPlainText> | undefined;
  let sourceImageUrl: string | null = null;

  const finish = (recipe: ExtractedRecipe): Recipe => {
    const decorated = decorateExtracted(
      recipe,
      sourceHintFromPayload(workingPayload),
      workingPayload,
      { preserveOcrLines: mediaList.length > 0 }
    );
    if (!isUsableCover(decorated.cover_image_url) && sourceImageUrl) {
      return {
        ...decorated,
        cover_image_url: sourceImageUrl,
        cover_display: "photo",
      };
    }
    return decorated;
  };

  // Social posts are not a public recipe page. Need a caption, paste, or photo.
  if (
    !mediaList.length &&
    isSocialWithoutUsableCaption(input.payload) &&
    (input.type === "url" || input.type === "text" || input.type === "document")
  ) {
    return {
      recipes: [],
      mode: "mock",
      status: REQUIRES_PASTE,
      message: notEnoughInfoMessage("share"),
    };
  }

  if (!mediaList.length && input.type === "url") {
    const url =
      input.payload.match(/https?:\/\/\S+/i)?.[0] ?? input.payload.trim();
    if (isInstagramUrl(url) || payloadHasInstagramUrl(input.payload)) {
      workingPayload = input.payload;
      structuredRecipe = structuredFromPlainText(
        workingPayload,
        url.match(/^https?:\/\//i)
          ? url
          : workingPayload.match(/https?:\/\/\S+/i)?.[0] ?? url
      );
    } else {
      try {
        const source = await fetchUrlSource(url);
        structuredRecipe = source.structured;
        sourceImageUrl =
          source.imageUrl ?? source.structured?.cover_image_url ?? null;
        workingPayload = [
          `Source URL: ${source.url}`,
          source.title ? `Page title: ${source.title}` : null,
          "",
          clipToRecipeBody(source.text),
        ]
          .filter(Boolean)
          .join("\n");

        if (structuredRecipe && !isWeakRecipe(finish(structuredRecipe))) {
          return {
            recipes: [finish(structuredRecipe)],
            mode: "structured",
          };
        }
        if (structuredRecipe && isWeakRecipe(finish(structuredRecipe))) {
          structuredRecipe = undefined;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Couldn’t fetch that recipe link.";
        return {
          recipes: [],
          mode: "mock",
          status: REQUIRES_PASTE,
          message:
            message === "instagram-caption-missing"
              ? notEnoughInfoMessage("share")
              : notEnoughInfoMessage("page"),
        };
      }
    }
  } else if (!mediaList.length && input.type === "html") {
    const url =
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
      "https://rendo.local/import";
    const htmlMatch = workingPayload.match(/<!DOCTYPE html|<html[\s>]/i);
    const html = htmlMatch
      ? workingPayload.slice(htmlMatch.index)
      : workingPayload;
    const parsed = parseRecipeFromHtml(html, url);
    structuredRecipe = parsed?.structured;
    workingPayload = [
      `Source URL: ${url}`,
      parsed?.title ? `Page title: ${parsed.title}` : null,
      "",
      clipToRecipeBody(
        parsed?.text ?? html.replace(/<[^>]+>/g, " ")
      ).slice(0, 40000),
    ]
      .filter(Boolean)
      .join("\n");
    if (!structuredRecipe) {
      structuredRecipe = structuredFromPlainText(workingPayload, url);
    }
    if (structuredRecipe && !isWeakRecipe(finish(structuredRecipe))) {
      return {
        recipes: [finish(structuredRecipe)],
        mode: "structured",
      };
    }
    if (structuredRecipe && isWeakRecipe(finish(structuredRecipe))) {
      structuredRecipe = undefined;
    }
  } else if (
    !mediaList.length &&
    (input.type === "text" || input.type === "document")
  ) {
    // Keep heuristic as fallback only — prefer Gemini when configured so
    // freeform pastes get a real title and cleaner ingredients/steps.
    structuredRecipe = structuredFromPlainText(
      workingPayload,
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
        "https://rendo.local/import"
    );
    if (structuredRecipe && (geminiDisabledMessage || !apiKey)) {
      const decorated = finish(structuredRecipe);
      if (!isWeakRecipe(decorated)) {
        return {
          recipes: [decorated],
          mode: "structured",
          warning: geminiDisabledMessage ?? undefined,
        };
      }
    }
  }

  if (!workingPayload.trim() && !mediaList.length) {
    return {
      recipes: [],
      mode: "mock",
      warning: "Nothing to extract. Paste a recipe link or recipe text.",
    };
  }

  // Instagram captions with ingredients/steps go to Gemini. Informal lists
  // (emoji, no headers) fail the local parser; do not return missing-caption.

  const skipGemini = Boolean(geminiDisabledMessage) || !apiKey;

  if (skipGemini) {
    if (structuredRecipe && !mediaList.length) {
      return {
        recipes: [finish(structuredRecipe)],
        mode: "structured",
        warning: geminiDisabledMessage ?? undefined,
      };
    }
    if (mediaList.length) {
      return {
        recipes: [],
        mode: "mock",
        warning:
          geminiDisabledMessage ??
          "GEMINI_API_KEY is not set. Use Paste Recipe Text, or set a valid key on Netlify.",
      };
    }
    const heuristic = structuredFromPlainText(
      workingPayload,
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
        "https://rendo.local/import"
    );
    if (heuristic) {
      return {
        recipes: [finish(heuristic)],
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
  const promptParts = mediaList.length
    ? visionBatchPromptParts(workingPayload, mediaList)
    : [
        {
          text: buildExtractionUserPrompt({
            type: input.type,
            payload: workingPayload,
          }),
        },
      ];

  let sawModelError = false;
  let lastModelError = "";
  const modelsToTry = uniqueModels(
    mediaList.length ? VISION_MODEL_CANDIDATES : TEXT_MODEL_CANDIDATES
  );
  const generateTimeout = mediaList.length ? 50_000 : 18_000;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: mediaList.length
          ? VISION_SYSTEM_PROMPT
          : EXTRACTION_SYSTEM_PROMPT,
        generationConfig: mediaList.length
          ? {
              responseMimeType: "application/json",
              responseSchema: VISION_RESPONSE_SCHEMA,
              temperature: 0.2,
            }
          : {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
      });

      const result = await withTimeout(
        model.generateContent(promptParts),
        generateTimeout
      );
      const text = result.response.text();
      let parsed;
      try {
        parsed = parseExtractionJson(text);
      } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        parsed = parseExtractionJson(
          start >= 0 && end > start ? text.slice(start, end + 1) : text
        );
      }
      const recipes = (
        mediaList.length
          ? stitchVisionRecipes(parsed.recipes.map(finish))
          : parsed.recipes.map(finish)
      ).filter((recipe) =>
        !isWeakRecipe(recipe, { fromMedia: mediaList.length > 0 })
      );
      if (!recipes.length) {
        // Blank / non-recipe photos. A readable card is kept by isWeakRecipe({ fromMedia }).
        if (input.type === "ocr" || input.type === "upload") {
          return {
            recipes: [],
            mode: "gemini",
            warning:
              "Text unreadable, try a clearer photo.",
          };
        }
        break;
      }
      return {
        recipes,
        mode: "gemini",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gemini request failed";
      lastModelError = message;
      if (isInvalidApiKeyError(message)) {
        geminiDisabledMessage =
          "Gemini API key on Netlify is invalid. Set GEMINI_API_KEY to your AQ… key, then clear cache & deploy.";
        break;
      }
      sawModelError = true;
      if (isTimeoutError(message) && mediaList.length) {
        break;
      }
      if (!isMissingModelError(message) && mediaList.length) {
        break;
      }
    }
  }

  if (structuredRecipe && !mediaList.length) {
    const decorated = finish(structuredRecipe);
    if (!isWeakRecipe(decorated)) {
      return {
        recipes: [decorated],
        mode: "structured",
        warning: geminiDisabledMessage ?? "Saved from page recipe data.",
      };
    }
  }

  if (!mediaList.length) {
    const heuristic = structuredFromPlainText(
      workingPayload,
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ?? "https://rendo.local/import"
    );
    if (heuristic) {
      const decorated = finish(heuristic);
      if (!isWeakRecipe(decorated)) {
        return {
          recipes: [decorated],
          mode: "structured",
          warning: geminiDisabledMessage ?? "Saved a best-effort parse.",
        };
      }
    }
  }

  if (input.type === "ocr" || input.type === "upload") {
    return {
      recipes: [],
      mode: "mock",
      status: isTimeoutError(lastModelError) ? undefined : REQUIRES_PASTE,
      message: isTimeoutError(lastModelError)
        ? undefined
        : notEnoughInfoMessage("photo"),
      warning:
        geminiDisabledMessage ??
        (isTimeoutError(lastModelError)
          ? "That photo took too long. Try one closer, well-lit shot."
          : notEnoughInfoMessage("photo")),
    };
  }

  const sourceUrl =
    workingPayload.match(/https?:\/\/\S+/i)?.[0] ?? "https://rendo.local/import";

  if (isSocialWithoutUsableCaption(workingPayload) || isSocialShellTitle(workingPayload)) {
    return emptyNotEnough(input.type, workingPayload);
  }

  return emptyNotEnough(input.type, workingPayload, geminiDisabledMessage);
}

function extractKind(type: string, payload: string): NotEnoughSource {
  if (type === "ocr" || type === "upload") return "photo";
  if (type === "document") return "document";
  if (payloadHasSocialPostUrl(payload)) return "share";
  if (type === "url" || type === "html") return "page";
  return "text";
}

function emptyNotEnough(
  type: string,
  payload: string,
  warning?: string | null
): ExtractResult {
  const message = notEnoughInfoMessage(extractKind(type, payload));
  return {
    recipes: [],
    mode: "mock",
    status: REQUIRES_PASTE,
    message,
    warning: warning || message,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Gemini timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function isInvalidApiKeyError(message: string): boolean {
  return /API_KEY_INVALID|API key not valid|invalid api key/i.test(message);
}

function isTimeoutError(message: string): boolean {
  return /timed out|timeout|deadline exceeded/i.test(message);
}

function isMissingModelError(message: string): boolean {
  return /not found|404|unknown model|not supported for/i.test(message);
}

function uniqueModels(models: string[]): string[] {
  return [...new Set(models.filter(Boolean))];
}

function isUsableCover(url: string | null | undefined): boolean {
  return isUsableImageUrl(url);
}

async function ensurePhotolessSubtitle(recipe: Recipe): Promise<Recipe> {
  if (!needsGeminiSubtitle(recipe)) return recipe;
  const subtitle = await generateGeminiSubtitle(recipe);
  if (!subtitle) return recipe;
  return {
    ...recipe,
    subtitle,
    subtitle_manual: false,
    cover_display: recipe.cover_display === "mine" ? "mine" : "type",
  };
}

function isSocialShellTitle(payload: string): boolean {
  const titleLine = payload.match(/^Page title:\s*(.+)$/im)?.[1]?.trim() ?? "";
  return /^(instagram|tiktok|facebook|youtube|pinterest)$/i.test(titleLine);
}

export function recipeBodyForSubtitle(input: {
  title: string;
  ingredients_normalized: Ingredient[];
  steps: RecipeStep[];
}) {
  const ingredients = input.ingredients_normalized.map((ing) => {
    const amount = ing.amount == null ? "" : String(ing.amount);
    return [amount, ing.unit ?? "", ing.name].filter(Boolean).join(" ");
  });
  const directions = input.steps.map(
    (step) =>
      `${step.step_number}. ${step.action_header}: ${step.instruction}`
  );
  return [
    `Title: ${input.title}`,
    "cover_image_url: null",
    "",
    "Ingredients:",
    ...ingredients,
    "",
    "Directions:",
    ...directions,
  ].join("\n");
}

/** Gemini-only subtitle. Returns null when the model is unavailable or the line fails validation. */
export async function generateGeminiSubtitle(input: {
  title: string;
  ingredients_normalized: Ingredient[];
  steps: RecipeStep[];
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || geminiDisabledMessage) return null;

  const payload = recipeBodyForSubtitle(input);
  if (!payload.trim()) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const promptParts = [
    { text: EXTRACTION_SYSTEM_PROMPT },
    {
      text: buildExtractionUserPrompt({
        type: "text",
        payload,
      }),
    },
    {
      text: "This recipe has no photo. Return the JSON object with a subtitle that follows rule 14. Set cover_image_url to null. Do not invent a photo URL.",
    },
  ];

  const modelsToTry = uniqueModels(TEXT_MODEL_CANDIDATES).slice(0, 2);
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });
      const result = await withTimeout(
        model.generateContent(promptParts),
        30_000
      );
      const text = result.response.text();
      let raw: string | null = null;
      try {
        const parsed = parseExtractionJson(text);
        raw = parsed.recipes[0]?.subtitle ?? null;
      } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        const slice =
          start >= 0 && end > start ? text.slice(start, end + 1) : text;
        try {
          const parsed = parseExtractionJson(slice);
          raw = parsed.recipes[0]?.subtitle ?? null;
        } catch {
          const loose = JSON.parse(slice) as {
            subtitle?: string;
            recipes?: Array<{ subtitle?: string | null }>;
          };
          raw = loose.recipes?.[0]?.subtitle ?? loose.subtitle ?? null;
        }
      }
      return validateGeminiSubtitle(raw, input.title);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gemini request failed";
      if (isInvalidApiKeyError(message)) {
        geminiDisabledMessage =
          "Gemini API key on Netlify is invalid. Set GEMINI_API_KEY to your AQ… key, then clear cache & deploy.";
        return null;
      }
    }
  }
  return null;
}

/** Assign group headings to an existing ingredient list. Does not rewrite lines. */
export async function assignIngredientSections(input: {
  title: string;
  ingredients_normalized: Ingredient[];
  steps: RecipeStep[];
}): Promise<Array<{ id: string; section: string | null }> | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || geminiDisabledMessage) return null;
  if (input.ingredients_normalized.length < 4) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const lines = input.ingredients_normalized.map((ing) => {
    const qty = [ing.amount, ing.unit].filter((part) => part != null && part !== "").join(" ");
    return `${ing.id}: ${[qty, ing.name].filter(Boolean).join(" ")}`;
  });
  const directions = input.steps.map(
    (step) => `${step.step_number}. ${step.action_header}: ${step.instruction}`
  );
  const promptParts = [
    {
      text: `You restore ingredient group headings for a saved recipe. Do not add, remove, or rewrite ingredients.
Return JSON only: {"sections":[{"id":"ing_1","section":"For the steak"},{"id":"ing_2","section":null}]}
Rules:
- Same number of objects as ingredients, same ids, same order.
- section is a short heading without a trailing colon (For the salsa, Dressing, Salad) or null.
- Duplicate names (olive oil twice) MUST get different sections when they belong to different parts of the dish.
- If this is one ungrouped list, set every section to null.`,
    },
    {
      text: [
        `Title: ${input.title}`,
        "",
        "Ingredients:",
        ...lines,
        "",
        "Directions:",
        ...directions,
      ].join("\n"),
    },
  ];

  const modelsToTry = uniqueModels(TEXT_MODEL_CANDIDATES).slice(0, 2);
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });
      const result = await withTimeout(
        model.generateContent(promptParts),
        30_000
      );
      const text = result.response.text();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      const slice =
        start >= 0 && end > start ? text.slice(start, end + 1) : text;
      const parsed = JSON.parse(slice) as {
        sections?: Array<{ id?: string; section?: string | null }>;
      };
      const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
      if (sections.length !== input.ingredients_normalized.length) return null;
      return input.ingredients_normalized.map((ing, index) => ({
        id: ing.id,
        section: sections[index]?.section ?? null,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gemini request failed";
      if (isInvalidApiKeyError(message)) {
        geminiDisabledMessage =
          "Gemini API key on Netlify is invalid. Set GEMINI_API_KEY to your AQ… key, then clear cache & deploy.";
        return null;
      }
    }
  }
  return null;
}
