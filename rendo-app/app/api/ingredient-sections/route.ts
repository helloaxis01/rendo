import { NextResponse } from "next/server";
import { z } from "zod";
import { recoverIngredientSections } from "@/lib/extract/recover-sections";

export const maxDuration = 60;

const RequestSchema = z.object({
  title: z.string().min(1),
  source_url: z.string().nullable(),
  ingredients_normalized: z.array(
    z.object({
      id: z.string(),
      amount: z.number().nullable(),
      unit: z.string().nullable(),
      name: z.string(),
      search_key: z.string(),
      section: z.string().nullable().optional(),
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
    const body = RequestSchema.parse(await request.json());
    const ingredients = await recoverIngredientSections({
      title: body.title,
      source_url: body.source_url,
      ingredients_normalized: body.ingredients_normalized.map((ing) => ({
        ...ing,
        checked: ing.checked ?? false,
      })),
      steps: body.steps,
    });
    return NextResponse.json({ ingredients });
  } catch {
    return NextResponse.json({ ingredients: null }, { status: 400 });
  }
}
