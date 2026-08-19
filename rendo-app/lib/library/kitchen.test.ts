import assert from "node:assert/strict";
import { test } from "node:test";
import type { Recipe } from "../db/types.ts";
import {
  kitchenMatchScore,
  kitchenRecipeFit,
  kitchenSummary,
  kitchenSummaryLine,
  parseKitchenItems,
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
const riceBowl = recipe({
  id: "rice",
  title: "Rice bowl",
  created_at: "2026-04-01T00:00:00.000Z",
  ingredients: [
    { name: "cooked rice", search_key: "rice" },
    { name: "chicken thigh", search_key: "chicken" },
  ],
});
const stirFry = recipe({
  id: "stirfry",
  title: "Stir fry",
  created_at: "2026-01-15T00:00:00.000Z",
  ingredients: [
    { name: "chicken breast", search_key: "chicken" },
    { name: "cooked rice", search_key: "rice" },
    { name: "garlic", search_key: "garlic" },
    { name: "spaghetti", search_key: "pasta" },
  ],
});
const oats = recipe({
  id: "oats",
  title: "Oats",
  ingredients: [{ name: "rolled oats", search_key: "oats" }],
});
const eggplant = recipe({
  id: "eggplant",
  title: "Eggplant",
  ingredients: [{ name: "eggplant", search_key: "eggplant" }],
});
const garlicFeast = recipe({
  id: "feast",
  title: "Garlic feast",
  ingredients: [
    { name: "garlic", search_key: "garlic" },
    { name: "chicken breast", search_key: "chicken" },
    { name: "cream", search_key: "cream" },
    { name: "parmesan", search_key: "parmesan" },
    { name: "white wine", search_key: "wine" },
    { name: "shallot", search_key: "shallot" },
    { name: "thyme", search_key: "thyme" },
    { name: "lemon", search_key: "lemon" },
    { name: "butter", search_key: "butter" },
    { name: "parsley", search_key: "parsley" },
  ],
});

test("mostly-make hides recipes you only share one staple food with", () => {
  const ranked = rankRecipesByKitchen(
    [chicken, pasta, oats, garlicFeast],
    ["garlic"]
  );
  assert.deepEqual(
    ranked.map((item) => item.id),
    ["pasta"]
  );
  assert.equal(kitchenRecipeFit(chicken, ["garlic"]).canMake, false);
  assert.equal(kitchenRecipeFit(garlicFeast, ["garlic"]).canMake, false);
  assert.equal(kitchenRecipeFit(pasta, ["garlic"]).canMake, true);
});

test("recipes you can actually cook with the list rise first", () => {
  const ranked = rankRecipesByKitchen(
    [chicken, pasta, riceBowl, stirFry, oats, garlicFeast],
    ["chicken", "rice", "garlic", "pasta"]
  );
  assert.equal(ranked[0]?.id, "stirfry");
  assert.ok(ranked.some((item) => item.id === "chicken"));
  assert.ok(ranked.some((item) => item.id === "rice"));
  assert.ok(ranked.some((item) => item.id === "pasta"));
  assert.ok(!ranked.some((item) => item.id === "feast"));
  assert.ok(!ranked.some((item) => item.id === "oats"));
  assert.equal(kitchenRecipeFit(stirFry, ["chicken", "rice", "garlic", "pasta"]).missing, 0);
});

test("chicken matches chicken breast by whole word, egg does not match eggplant", () => {
  assert.equal(kitchenMatchScore(chicken, ["chicken"]), 1);
  assert.equal(kitchenMatchScore(eggplant, ["egg"]), 0);
  assert.equal(kitchenMatchScore(pasta, ["pasta"]), 1);
});

test("parseKitchenItems splits commas and and", () => {
  assert.deepEqual(parseKitchenItems("garlic and pasta"), ["garlic", "pasta"]);
  assert.deepEqual(parseKitchenItems("chicken, rice"), ["chicken", "rice"]);
});

test("kitchen summary counts mostly-make vs complete", () => {
  const selected = ["chicken", "rice", "garlic", "pasta"];
  const summary = kitchenSummary(
    [chicken, pasta, riceBowl, stirFry, oats, garlicFeast],
    selected
  );
  assert.equal(summary.canMake, 4);
  assert.equal(summary.complete, 4);
  assert.equal(
    kitchenSummaryLine(selected, summary),
    "4 recipes you can make with this."
  );
  assert.equal(
    kitchenSummaryLine(["garlic"], kitchenSummary([garlicFeast], ["garlic"])),
    "Add 2 or 3 more ingredients. garlic alone is in too many recipes to be useful."
  );
});

test("kitchen suggestions prefer prefix matches", () => {
  const suggestions = suggestKitchenIngredients(
    ["garlic", "ginger", "chicken"],
    "ga",
    []
  );
  assert.deepEqual(suggestions, ["garlic"]);
});
