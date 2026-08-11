import { NextResponse } from "next/server";
import { extractRecipes } from "@/lib/extract/gemini";
import { ExtractRequestSchema } from "@/lib/extract/schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = ExtractRequestSchema.parse(body);
    const result = await extractRecipes(input);
    return NextResponse.json({
      recipes: result.recipes,
      mode: result.mode,
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
