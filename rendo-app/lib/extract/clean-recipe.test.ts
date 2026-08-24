import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clipToRecipeBody,
  coalesceIngredientLines,
  dedupeIngredientRecords,
  flattenTags,
  isChromeLine,
  looksLikeIngredientLine,
  looksLikeStepLine,
  looksLikeWebpageChrome,
} from "./clean-recipe.ts";

test("chrome lines from a typical recipe blog are dropped", () => {
  const junk = [
    "start trial",
    "Start your free trial",
    "previous next",
    "Previous",
    "privacy terms",
    "Privacy Policy",
    "@2026 victoria minell",
    "© 2026 Victoria Minell",
  ];
  for (const line of junk) {
    assert.equal(isChromeLine(line), true, line);
    assert.equal(looksLikeIngredientLine(line), false, line);
    assert.equal(looksLikeStepLine(line), false, line);
  }
});

test("real ingredient and step lines still pass", () => {
  assert.equal(looksLikeIngredientLine("2 cups flour"), true);
  assert.equal(looksLikeIngredientLine("pinch of salt"), true);
  assert.equal(
    looksLikeStepLine("Whisk the eggs with the milk until smooth."),
    true
  );
});

test("schema metadata is not treated as a cooking step", () => {
  assert.equal(
    looksLikeStepLine(
      "Title: Pan Con Tomate Tomato Bread Recipe Description: Make authentic Spanish Pan Con Tomate."
    ),
    false
  );
  assert.equal(
    looksLikeStepLine("Total time: PT8M Yield: 4 slices, serves 2"),
    false
  );
});

test("prep fragments coalesce onto the previous ingredient", () => {
  const merged = coalesceIngredientLines([
    "2 large garlic cloves",
    "peeled",
    "halved",
    "salt",
    "or to taste",
    "2 slices bread",
    "cut 1cm thick (around 180g/6ozs total)",
  ]);
  assert.deepEqual(merged, [
    "2 large garlic cloves, peeled, halved",
    "salt or to taste",
    "2 slices bread, cut 1cm thick (around 180g/6ozs total)",
  ]);
  assert.equal(looksLikeIngredientLine("peeled"), false);
});

test("comma-joined tags split into separate chips", () => {
  assert.deepEqual(flattenTags(["Appetizer, Lenny Approved", "Snack"]), [
    "Appetizer",
    "Lenny Approved",
    "Snack",
  ]);
});

test("dedupeIngredientRecords collapses step-mined duplicates", () => {
  const deduped = dedupeIngredientRecords([
    {
      name: "fresh cilantro, chopped",
      search_key: "cilantro",
      section: null,
      amount: null,
      unit: null,
    },
    {
      name: "2 tbsp olive oil",
      search_key: "olive oil",
      section: null,
      amount: 2,
      unit: "tbsp",
    },
    {
      name: "cilantro",
      search_key: "cilantro",
      section: null,
      amount: null,
      unit: null,
    },
    {
      name: "olive oil",
      search_key: "oil",
      section: null,
      amount: null,
      unit: null,
    },
  ]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0]?.search_key, "cilantro");
  assert.equal(deduped[1]?.amount, 2);
  assert.equal(deduped[1]?.search_key, "olive oil");
});

test("dedupeIngredientRecords keeps same food in different sections", () => {
  const deduped = dedupeIngredientRecords([
    {
      name: "olive oil",
      search_key: "olive oil",
      section: "Marinade",
      amount: 1,
      unit: "tbsp",
    },
    {
      name: "olive oil",
      search_key: "olive oil",
      section: "Salsa",
      amount: 2,
      unit: "tbsp",
    },
  ]);
  assert.equal(deduped.length, 2);
});

test("clipToRecipeBody keeps ingredients and drops footer chrome", () => {
  const page = [
    "Home About Shop Subscribe",
    "Ingredients",
    "1 cup sugar",
    "2 eggs",
    "Directions",
    "Mix and bake at 350F until golden.",
    "Privacy Policy",
    "Copyright 2026",
    "Subscribe to our newsletter",
  ].join("\n");
  const clipped = clipToRecipeBody(page);
  assert.match(clipped, /1 cup sugar/);
  assert.doesNotMatch(clipped, /Subscribe to our newsletter/);
});

test("webpage chrome heuristic fires on nav-heavy pages", () => {
  const text = `privacy cookie subscribe start trial previous next leave a comment related posts
${"lorem ipsum ".repeat(400)}`;
  assert.equal(looksLikeWebpageChrome(text), true);
});
