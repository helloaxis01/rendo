import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  fetchUrlSource,
  parseRecipeFromHtml,
  structuredFromPlainText,
} from "@/lib/extract/fetch-url";
import { isInstagramUrl } from "@/lib/extract/instagram";
import {
  buildExtractionUserPrompt,
  decorateExtracted,
  EXTRACTION_SYSTEM_PROMPT,
  mockExtractFromPayload,
  parseExtractionJson,
  sourceHintFromPayload,
} from "@/lib/extract/schema";
import type { ExtractedRecipe, Recipe } from "@/lib/db/types";

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
  let sourceImageUrl: string | null = null;

  const finish = (recipe: ExtractedRecipe): Recipe => {
    const decorated = decorateExtracted(
      recipe,
      sourceHintFromPayload(workingPayload)
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
    try {
      const source = await fetchUrlSource(url);
      structuredRecipe = source.structured;
      sourceImageUrl = source.imageUrl ?? source.structured?.cover_image_url ?? null;
      workingPayload = [
        `Source URL: ${source.url}`,
        source.title ? `Page title: ${source.title}` : null,
        "",
        source.text,
      ]
        .filter(Boolean)
        .join("\n");

      // Instagram captions + thin pages need Gemini — don't keep hostname stubs.
      if (
        structuredRecipe &&
        !isWeakRecipe(finish(structuredRecipe)) &&
        !isInstagramUrl(url)
      ) {
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
    // Keep heuristic as fallback only — prefer Gemini when configured so
    // freeform pastes get a real title and cleaner ingredients/steps.
    structuredRecipe = structuredFromPlainText(
      workingPayload,
      workingPayload.match(/https?:\/\/\S+/i)?.[0] ??
        "https://rendo.local/import"
    );
    if (structuredRecipe && (geminiDisabledMessage || !apiKey)) {
      return {
        recipes: [finish(structuredRecipe)],
        mode: "structured",
        warning: geminiDisabledMessage ?? undefined,
      };
    }
  }

  if (!workingPayload.trim() && !media?.data) {
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

  // Never invent an "Instagram" card with stub ingredients — that was the bug.
  if (isInstagramUrl(sourceUrl) || isSocialShellTitle(workingPayload)) {
    return {
      recipes: [],
      mode: "mock",
      warning:
        geminiDisabledMessage ??
        (sawModelError
          ? "Couldn't extract a recipe from that Instagram post. Copy the caption and use Paste Recipe Text."
          : "Couldn't find a recipe in that Instagram caption. Copy the caption and use Paste Recipe Text."),
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

function isInvalidApiKeyError(message: string): boolean {
  return /API_KEY_INVALID|API key not valid|invalid api key|400 Bad Request.*API|generateContent: \[400/i.test(
    message
  );
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
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (/instagram\.com\/(p|reel|reels|stories|tv)\b/i.test(trimmed)) return false;
  return true;
}
