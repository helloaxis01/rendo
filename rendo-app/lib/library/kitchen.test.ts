import assert from "node:assert/strict";
import { test } from "node:test";
import type { Recipe } from "../db/types.ts";
import {
  kitchenMatchScore,
  rankRecipesByKitchen,
  suggestKitchenIngredients,
} from "./kitchen.ts";

function recipe(
  patch: Partial<Recipe> & {
    id: string;
    title: string;
    ingredients: Array<{ name: string; search_key: string }>;
  }
): Recipe {
  const { ingredients, ...rest } = patch;
  return {
    source_handle: null,
    source_url: null,
    prep_time_minutes: 25,
    servings_base: 4,
    cover_image_url: null,
    is_favorite: false,
    tags: [],
    steps: [],
    kitchen_notes: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ingredients_normalized: ingredients.map((ing, index) => ({
      id: `ing_${index + 1}`,
      amount: 1,
      unit: null,
      name: ing.name,
      search_key: ing.search_key,
    })),
    ...rest,
  };
}

const chicken = recipe({
  id: "chicken",
  title: "Chicken",
  created_at: "2026-02-01T00:00:00.000Z",
  ingredients: [
    { name: "chicken breast", search_key: "chicken" },
    { name: "garlic", search_key: "garlic" },
  ],
});
const pasta = recipe({
  id: "pasta",
  title: "Pasta",
  created_at: "2026-03-01T00:00:00.000Z",
  ingredients: [
    { name: "spaghetti", search_key: "pasta" },
    { name: "garlic cloves", search_key: "garlic" },
    { name: "olive oil", search_key: "oil" },
  ],
});
const oats = recipe({
  id: "oats",
  title: "Oats",
  ingredients: [{ name: "rolled oats", search_key: "oats" }],
});

test("partial kitchen matches still rank, 100% is not required", () => {
  const ranked = rankRecipesByKitchen([chicken, pasta, oats], ["garlic", "chicken"]);
  assert.deepEqual(
    ranked.map((item) => item.id),
    ["chicken", "pasta"]
  );
  assert.equal(kitchenMatchScore(chicken, ["garlic", "chicken"]), 2);
  assert.equal(kitchenMatchScore(pasta, ["garlic", "chicken"]), 1);
});

test("kitchen suggestions prefer prefix matches", () => {
  const suggestions = suggestKitchenIngredients(
    ["garlic", "ginger", "chicken"],
    "ga",
    []
  );
  assert.deepEqual(suggestions, ["garlic"]);
});
