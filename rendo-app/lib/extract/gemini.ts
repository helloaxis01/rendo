import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  fetchUrlSource,
  parseRecipeFromHtml,
  structuredFromPlainText,
} from "@/lib/extract/fetch-url";
import {
  INSTAGRAM_CAPTION_MISSING,
  isInstagramUrl,
  isInstagramWithoutCaption,
  payloadHasInstagramUrl,
} from "@/lib/extract/instagram";
import {
  buildExtractionUserPrompt,
  decorateExtracted,
  EXTRACTION_SYSTEM_PROMPT,
  mockExtractFromPayload,
  parseExtractionJson,
  sourceHintFromPayload,
} from "@/lib/extract/schema";
import type { ExtractedRecipe, Ingredient, Recipe, RecipeStep } from "@/lib/db/types";
import { isUsableImageUrl } from "@/lib/cover";
import { needsGeminiSubtitle, validateGeminiSubtitle } from "@/lib/extract/subtitle";

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
  const result = await extractRecipesCore(input);
  if (!result.recipes.length) return result;
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
  let sourceImageUrl: string | null = null;

  const finish = (recipe: ExtractedRecipe): Recipe => {
    const decorated = decorateExtracted(
      recipe,
      sourceHintFromPayload(workingPayload),
      workingPayload
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

  if (input.type === "url") {
    const url =
      input.payload.match(/https?:\/\/\S+/i)?.[0] ?? input.payload.trim();
    if (isInstagramUrl(url) || payloadHasInstagramUrl(input.payload)) {
      if (isInstagramWithoutCaption(input.payload)) {
        return {
          recipes: [],
          mode: "mock",
          warning: INSTAGRAM_CAPTION_MISSING,
        };
      }
      // Caption arrived with the link — never scrape Instagram.
      workingPayload = input.payload;
      structuredRecipe = structuredFromPlainText(
        workingPayload,
        url.match(/^https?:\/\//i) ? url : workingPayload.match(/https?:\/\/\S+/i)?.[0] ?? url
      );
      if (structuredRecipe && !isWeakRecipe(finish(structuredRecipe))) {
        return {
          recipes: [finish(structuredRecipe)],
          mode: "structured",
        };
      }
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
          source.text,
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
          warning:
            message === "instagram-caption-missing"
              ? INSTAGRAM_CAPTION_MISSING
              : message,
        };
      }
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
        recipes: [finish(parsed.structured)],
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
        recipes: [finish(structuredRecipe)],
        mode: "structured",
      };
    }
  } else if (input.type === "text" || input.type === "document") {
    if (isInstagramWithoutCaption(workingPayload)) {
      return {
        recipes: [],
        mode: "mock",
        warning: INSTAGRAM_CAPTION_MISSING,
      };
    }
    // Keep heuristic as fallback only — prefer Gemini when configured so
    // freeform pastes get a real title and cleaner ingredients/steps.
    structuredRecipe = structuredFromPlainText(
      workingPayload,
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
        "https://rendo.local/import"
    );
    if (
      structuredRecipe &&
      (geminiDisabledMessage ||
        !apiKey ||
        payloadHasInstagramUrl(workingPayload))
    ) {
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

  if (!workingPayload.trim() && !media?.data) {
    return {
      recipes: [],
      mode: "mock",
      warning: "Nothing to extract. Paste a recipe link or recipe text.",
    };
  }

  const instagramText =
    payloadHasInstagramUrl(workingPayload) && !media?.data;
  if (instagramText) {
    if (isInstagramWithoutCaption(workingPayload)) {
      return {
        recipes: [],
        mode: "mock",
        warning: INSTAGRAM_CAPTION_MISSING,
      };
    }
    const fromCaption =
      (structuredRecipe && !isWeakRecipe(finish(structuredRecipe))
        ? finish(structuredRecipe)
        : null) ??
      (() => {
        const parsed = structuredFromPlainText(
          workingPayload,
          workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
            "https://rendo.local/import"
        );
        if (!parsed) return null;
        const decorated = finish(parsed);
        return isWeakRecipe(decorated) ? null : decorated;
      })();
    if (fromCaption) {
      return { recipes: [fromCaption], mode: "structured" };
    }
    return {
      recipes: [],
      mode: "mock",
      warning: INSTAGRAM_CAPTION_MISSING,
    };
  }

  const skipGemini = Boolean(geminiDisabledMessage) || !apiKey;

  if (skipGemini) {
    if (structuredRecipe) {
      return {
        recipes: [finish(structuredRecipe)],
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
  const modelsToTry = MODEL_CANDIDATES.slice(0, 2);

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
        18_000
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
      const recipes = parsed.recipes
        .map(finish)
        .filter((recipe) => !isWeakRecipe(recipe));
      if (!recipes.length) {
        // Vision often invents an empty "Unknown Recipe" for blank photos
        if (input.type === "ocr" || input.type === "upload") {
          return {
            recipes: [],
            mode: "gemini",
            warning:
              "Couldn't find a readable recipe in that image. Try a clearer photo or Paste Recipe Text.",
          };
        }
        // Fall through to structured/heuristic fallbacks for text sources
        break;
      }
      return {
        recipes,
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
    const decorated = finish(structuredRecipe);
    if (!isWeakRecipe(decorated)) {
      return {
        recipes: [decorated],
        mode: "structured",
        warning: geminiDisabledMessage ?? "Saved from page recipe data.",
      };
    }
  }

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

  if (input.type === "ocr" || input.type === "upload") {
    return {
      recipes: [],
      mode: "mock",
      warning:
        geminiDisabledMessage ??
        "Couldn't read that image with Gemini. Try Paste Recipe Text.",
    };
  }

  const sourceUrl =
    workingPayload.match(/https?:\/\/\S+/i)?.[0] ?? "https://rendo.local/import";

  // Never invent an Instagram stub card, and never blame Gemini for a caption miss.
  if (isInstagramUrl(sourceUrl) || isSocialShellTitle(workingPayload)) {
    return {
      recipes: [],
      mode: "mock",
      warning: INSTAGRAM_CAPTION_MISSING,
    };
  }

  // Last resort: keep a rough recipe rather than failing the import entirely.
  const rough = mockExtractFromPayload(workingPayload)
    .map(finish)
    .filter((recipe) => !isWeakRecipe(recipe));
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

function isWeakRecipe(recipe: Recipe): boolean {
  const title = recipe.title.trim().toLowerCase();
  if (
    /^(unknown( recipe)?|untitled|recipe|imported recipe|n\/a|none|instagram|tiktok|facebook|pinterest|youtube)$/i.test(
      title
    )
  ) {
    return true;
  }
  if (
    /^(www\.)?(instagram|tiktok|facebook|youtube|pinterest)\.com$/i.test(title)
  ) {
    return true;
  }
  if ((recipe.ingredients_normalized?.length ?? 0) < 2) return true;
  if ((recipe.steps?.length ?? 0) < 1) return true;
  // Placeholder stub ingredients from mockExtract
  const stubby = recipe.ingredients_normalized?.some((ing) =>
    /edit me|primary ingredient \(edit me\)/i.test(ing.name)
  );
  if (stubby) return true;
  return false;
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

  const modelsToTry = MODEL_CANDIDATES.slice(0, 2);
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
