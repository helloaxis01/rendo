import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clipToRecipeBody,
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
