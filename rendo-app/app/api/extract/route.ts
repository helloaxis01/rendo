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
      ...result,
      warning: result.warning
        ? sanitizePublicMessage(result.warning)
        : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizePublicMessage(error) },
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

  if (/API_KEY_INVALID|API key not valid/i.test(message)) {
    return "Gemini API key on Netlify is invalid. Set GEMINI_API_KEY to your AQ… key, then clear cache & deploy.";
  }
  if (
    /GoogleGenerativeAI|generativelanguage\.googleapis|ErrorInfo|googleapis\.com\/google\.rpc/i.test(
      message
    )
  ) {
    return "Gemini request failed. Update GEMINI_API_KEY on Netlify, or use Paste Recipe Text / Paste Link.";
  }
  // Strip accidental JSON blobs from upstream errors
  if (message.includes("{") && message.includes('"@type"')) {
    return "Gemini request failed. Update GEMINI_API_KEY on Netlify, or use Paste Recipe Text.";
  }
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}
