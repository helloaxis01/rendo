import { NextResponse } from "next/server";
import { extractRecipes } from "@/lib/extract/gemini";
import { ExtractRequestSchema } from "@/lib/extract/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = ExtractRequestSchema.parse(body);
    const result = await extractRecipes(input);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
