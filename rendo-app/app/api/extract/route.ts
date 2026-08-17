import { NextResponse } from "next/server";
import { extractRecipes } from "@/lib/extract/gemini";
import { ExtractRequestSchema } from "@/lib/extract/schema";
import { decodedBase64Bytes, MAX_TOTAL_MEDIA_BYTES } from "@/lib/capture/media-budget";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = ExtractRequestSchema.parse(body);
    const mediaList = !input.media
      ? []
      : Array.isArray(input.media)
        ? input.media
        : [input.media];
    const total = mediaList.reduce(
      (sum, item) => sum + decodedBase64Bytes(item.data),
      0
    );
    if (total > MAX_TOTAL_MEDIA_BYTES) {
      return NextResponse.json(
        {
          error:
            "Those photos are too large. Try 1–2 clearer shots, or paste the recipe text.",
          recipes: [],
          mode: "mock",
        },
        { status: 413 }
      );
    }
    const result = await extractRecipes(input);
    return NextResponse.json({
      recipes: result.recipes,
      mode: result.mode,
      status: result.status,
      message: result.message,
      warning: result.warning
        ? sanitizePublicMessage(result.warning)
        : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizePublicMessage(error), recipes: [], mode: "mock" },
      { status: 400 }
    );
  }
}

function sanitizePublicMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Extraction failed";

  if (looksLikeGoogleError(message)) {
    return "Gemini API key on Netlify is invalid. Set GEMINI_API_KEY to your AQ… key, then clear cache & deploy.";
  }

  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}

function looksLikeGoogleError(message: string): boolean {
  return /API_KEY_INVALID|API key not valid|GoogleGenerativeAI|generativelanguage|LocalizedMes|ErrorInfo|googleapis\.com|"@type"|google\.rpc|generateContent|400 Bad Request/i.test(
    message
  );
}
