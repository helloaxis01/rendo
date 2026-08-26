import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@/lib/db/types";
import { buildRecipePdf } from "@/lib/print/build-recipe-pdf";
import {
  buildRecipePrintContent,
  formatRecipePlainText,
  recipePdfFilename,
} from "@/lib/print/recipe-print-content";

const sampleRecipe: Recipe = {
  id: "r1",
  title: "Weeknight Ragu",
  subtitle: null,
  prep_time_minutes: 35,
  servings_base: 4,
  ingredients_normalized: [
    {
      id: "i1",
      name: "ground beef",
      amount: 1,
      unit: "lb",
      section: null,
      confidence: "high",
      verified: false,
    },
    {
      id: "i2",
      name: "onion",
      amount: 1,
      unit: null,
      section: null,
      confidence: "high",
      verified: false,
    },
  ],
  steps: [
    { step_number: 1, instruction: "Brown the beef in a wide pan." },
    { step_number: 2, instruction: "Add onion and simmer tomatoes." },
  ],
  tags: [],
  source_url: "https://example.com/ragu",
  source_handle: "example.com",
  cover_image_url: null,
  user_cover_image_url: null,
  cover_image_position: null,
  user_cover_image_position: null,
  is_favorite: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  cook_events: [],
  notes: null,
};

test("buildRecipePrintContent includes checkbox-friendly ingredient lines", () => {
  const content = buildRecipePrintContent(sampleRecipe, 4, "imperial");
  assert.equal(content.title, "Weeknight Ragu");
  assert.equal(content.ingredientGroups.length, 1);
  assert.ok(content.ingredientGroups[0]?.items[0]?.includes("ground beef"));
  assert.equal(content.steps.length, 2);
});

test("formatRecipePlainText includes ingredients and steps", () => {
  const text = formatRecipePlainText(sampleRecipe, 4, "imperial");
  assert.match(text, /Weeknight Ragu/);
  assert.match(text, /☐/);
  assert.match(text, /Brown the beef/);
});

test("recipePdfFilename sanitizes titles", () => {
  assert.equal(recipePdfFilename("Mom's Pie!"), "moms-pie.pdf");
});

test("buildRecipePdf returns a valid PDF header", () => {
  const content = buildRecipePrintContent(sampleRecipe, 4, "imperial");
  const bytes = buildRecipePdf(content);
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  assert.equal(header, "%PDF-1.4");
  const body = new TextDecoder().decode(bytes);
  assert.match(body, /Weeknight Ragu/);
  assert.match(body, /Ingredients/);
  assert.match(body, /Directions/);
  assert.match(body, /Brown the beef/);
});
