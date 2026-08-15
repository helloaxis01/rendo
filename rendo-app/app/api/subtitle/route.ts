import { NextResponse } from "next/server";
import { z } from "zod";
import { generateGeminiSubtitle } from "@/lib/extract/gemini";

export const maxDuration = 60;

const SubtitleRequestSchema = z.object({
  title: z.string().min(1),
  ingredients_normalized: z.array(
    z.object({
      id: z.string(),
      amount: z.number().nullable(),
      unit: z.string().nullable(),
      name: z.string(),
      search_key: z.string(),
      checked: z.boolean().optional(),
    })
  ),
  steps: z.array(
    z.object({
      step_number: z.number(),
      action_header: z.string(),
      instruction: z.string(),
      timer_seconds: z.number().nullable().optional(),
    })
  ),
});

export async function POST(request: Request) {
  try {
    const body = SubtitleRequestSchema.parse(await request.json());
    const subtitle = await generateGeminiSubtitle(body);
    return NextResponse.json({ subtitle });
  } catch {
    return NextResponse.json({ subtitle: null }, { status: 400 });
  }
}
