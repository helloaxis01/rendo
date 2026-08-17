import assert from "node:assert/strict";
import { test } from "node:test";
import { isWeakRecipe } from "./quality.ts";
import type { Recipe } from "../db/types.ts";

function recipe(partial: Partial<Recipe>): Recipe {
  return {
    id: "rec_test",
    title: "Test Dish",
    subtitle: null,
    source_handle: null,
    source_url: null,
    prep_time_minutes: 20,
    servings_base: 4,
    cover_image_url: null,
    is_favorite: false,
    tags: [],
    ingredients_normalized: [
      {
        id: "ing_1",
        amount: 1,
        unit: "cup",
        name: "flour",
        search_key: "flour",
        checked: false,
      },
      {
        id: "ing_2",
        amount: 2,
        unit: null,
        name: "eggs",
        search_key: "egg",
        checked: false,
      },
    ],
    steps: [
      {
        step_number: 1,
        action_header: "MIX",
        instruction: "Stir until combined.",
        timer_seconds: null,
      },
    ],
    kitchen_notes: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("a normal recipe is not weak", () => {
  assert.equal(isWeakRecipe(recipe({})), false);
});

test("stub ingredients and social titles are weak", () => {
  assert.equal(
    isWeakRecipe(
      recipe({
        ingredients_normalized: [
          {
            id: "ing_1",
            amount: 1,
            unit: null,
            name: "primary ingredient (edit me)",
            search_key: "ingredient",
            checked: false,
          },
          {
            id: "ing_2",
            amount: 1,
            unit: "tbsp",
            name: "olive oil",
            search_key: "oil",
            checked: false,
          },
        ],
      })
    ),
    true
  );
  assert.equal(isWeakRecipe(recipe({ title: "Instagram" })), true);
  assert.equal(
    isWeakRecipe(
      recipe({
        ingredients_normalized: [
          {
            id: "ing_1",
            amount: null,
            unit: null,
            name: "salt",
            search_key: "salt",
            checked: false,
          },
        ],
      })
    ),
    true
  );
});
