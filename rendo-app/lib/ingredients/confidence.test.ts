import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ingredient, Recipe } from "../db/types.ts";
import {
  CONFIDENCE_REVIEW_THRESHOLD,
  confirmIngredientConfidence,
  isLowConfidence,
  recipesNeedConfidenceReview,
} from "./confidence.ts";

function ing(
  partial: Partial<Ingredient> & Pick<Ingredient, "id" | "name">
): Ingredient {
  return {
    amount: 1,
    unit: "cup",
    search_key: partial.name,
    raw_text: null,
    preparation_notes: null,
    confidence_score: null,
    checked: false,
    ...partial,
  };
}

function recipe(ingredients: Ingredient[]): Recipe {
  return {
    id: "r1",
    title: "Test",
    source_handle: null,
    source_url: null,
    prep_time_minutes: 0,
    servings_base: 4,
    cover_image_url: null,
    is_favorite: false,
    tags: [],
    ingredients_normalized: ingredients,
    steps: [],
    kitchen_notes: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

test("isLowConfidence uses 0.75 threshold", () => {
  assert.equal(CONFIDENCE_REVIEW_THRESHOLD, 0.75);
  assert.equal(
    isLowConfidence(ing({ id: "a", name: "flour", confidence_score: 0.74 })),
    true
  );
  assert.equal(
    isLowConfidence(ing({ id: "b", name: "flour", confidence_score: 0.75 })),
    false
  );
  assert.equal(
    isLowConfidence(ing({ id: "c", name: "flour", confidence_score: null })),
    false
  );
});

test("confirmIngredientConfidence raises score to 1", () => {
  const next = confirmIngredientConfidence(
    ing({ id: "a", name: "flour", confidence_score: 0.4 })
  );
  assert.equal(next.confidence_score, 1);
  assert.equal(isLowConfidence(next), false);
});

test("recipesNeedConfidenceReview detects any low score", () => {
  assert.equal(
    recipesNeedConfidenceReview([
      recipe([ing({ id: "a", name: "flour", confidence_score: 0.9 })]),
    ]),
    false
  );
  assert.equal(
    recipesNeedConfidenceReview([
      recipe([ing({ id: "a", name: "flour", confidence_score: 0.5 })]),
    ]),
    true
  );
});
