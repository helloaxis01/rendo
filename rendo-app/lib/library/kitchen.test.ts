import assert from "node:assert/strict";
import { test } from "node:test";
import type { Recipe } from "../db/types.ts";
import {
  collectKitchenIngredients,
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
const cucumberOnly = recipe({
  id: "cucumber",
  title: "Cucumber salad",
  ingredients: [
    { name: "cucumbers, sliced", search_key: "chopped" },
    { name: "vinegar", search_key: "vinegar" },
  ],
});
const avocadoToast = recipe({
  id: "avo",
  title: "Avocado toast",
  ingredients: [
    { name: "ripe avocado", search_key: "avocado" },
    { name: "garlic cloves, finely chopped", search_key: "finely chopped" },
    { name: "sourdough", search_key: "sourdough" },
  ],
});
const garlicOnly = recipe({
  id: "garlicky",
  title: "Garlicky greens",
  ingredients: [
    { name: "garlic", search_key: "garlic" },
    { name: "kale", search_key: "kale" },
  ],
});

test("On hand requires real ingredient_name overlap", () => {
  const ranked = rankRecipesByKitchen(
    [chicken, pasta, oats, cucumberOnly, avocadoToast, garlicOnly],
    ["garlic", "avocado"]
  );
  assert.deepEqual(
    ranked.map((item) => item.id).sort(),
    ["avo", "chicken", "garlicky", "pasta"].sort()
  );
  assert.ok(!ranked.some((item) => item.id === "cucumber"));
  assert.ok(!ranked.some((item) => item.id === "oats"));
});

test("badge counts matched selected ingredients, not recipe line totals", () => {
  const fit = kitchenRecipeFit(avocadoToast, ["garlic", "avocado"]);
  assert.equal(fit.matched, 2);
  assert.equal(fit.selectedCount, 2);
  assert.equal(fit.canMake, true);

  const garlicOnlyFit = kitchenRecipeFit(garlicOnly, ["garlic", "avocado"]);
  assert.equal(garlicOnlyFit.matched, 1);
  assert.equal(garlicOnlyFit.selectedCount, 2);
});

test("zero real matches yields empty On hand results", () => {
  const ranked = rankRecipesByKitchen(
    [cucumberOnly, oats, eggplant],
    ["garlic", "avocado"]
  );
  assert.deepEqual(ranked, []);
  assert.equal(
    kitchenSummaryLine(
      ["garlic", "avocado"],
      kitchenSummary([cucumberOnly, oats, eggplant], ["garlic", "avocado"])
    ),
    "No recipes match what you have on hand"
  );
});

test("junk prep search_keys still match via display name extraction", () => {
  assert.equal(kitchenMatchScore(cucumberOnly, ["cucumber"]), 1);
  assert.equal(kitchenMatchScore(cucumberOnly, ["chopped"]), 0);
  assert.equal(kitchenMatchScore(avocadoToast, ["garlic"]), 1);
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

test("pantry chips never surface prep fragments", () => {
  const chips = collectKitchenIngredients([
    cucumberOnly,
    avocadoToast,
    recipe({
      id: "junk",
      title: "Junk",
      ingredients: [
        { name: "(finely chopped)", search_key: "chopped" },
        { name: "sauce", search_key: "sauce" },
        { name: "tomato sauce", search_key: "sauce" },
      ],
    }),
  ]);
  assert.ok(!chips.includes("chopped"));
  assert.ok(!chips.includes("finely chopped"));
  assert.ok(!chips.includes("(finely chopped)"));
  assert.ok(!chips.includes("sauce"));
  assert.ok(chips.includes("tomato sauce") || chips.includes("cucumbers"));
  assert.ok(chips.includes("avocado") || chips.includes("garlic"));
});

test("kitchen suggestions prefer prefix matches", () => {
  const suggestions = suggestKitchenIngredients(
    ["garlic", "ginger", "chicken"],
    "ga",
    []
  );
  assert.deepEqual(suggestions, ["garlic"]);
});

test("rank prefers higher overlap", () => {
  const ranked = rankRecipesByKitchen(
    [garlicOnly, avocadoToast, chicken],
    ["garlic", "avocado"]
  );
  assert.equal(ranked[0]?.id, "avo");
  assert.equal(
    kitchenRecipeFit(stirFry, ["chicken", "rice", "garlic", "pasta"]).matched,
    4
  );
  assert.ok(
    rankRecipesByKitchen([chicken, pasta, riceBowl, stirFry, oats], [
      "chicken",
      "rice",
      "garlic",
      "pasta",
    ]).some((item) => item.id === "stirfry")
  );
});
