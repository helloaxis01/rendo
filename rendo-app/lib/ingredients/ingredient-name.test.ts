import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractIngredientName,
  ingredientName,
  isWeakIngredientName,
  resolveSearchKey,
} from "./ingredient-name.ts";

test("extracts core nouns from prep-heavy lines", () => {
  assert.equal(
    extractIngredientName("3 garlic cloves, finely chopped"),
    "garlic"
  );
  assert.equal(
    extractIngredientName("garlic cloves, finely chopped"),
    "garlic"
  );
  assert.equal(
    extractIngredientName("ripe Hass avocado (or 2 small)"),
    "hass avocado"
  );
  assert.equal(extractIngredientName("1 cup tomato sauce"), "tomato sauce");
  assert.equal(
    extractIngredientName("boneless skinless chicken breast, cubed"),
    "chicken breast"
  );
});

test("rejects prep fragments and weak alone words", () => {
  assert.equal(extractIngredientName("(finely chopped)"), "");
  assert.equal(extractIngredientName("finely chopped"), "");
  assert.equal(extractIngredientName("chopped"), "");
  assert.equal(extractIngredientName("sauce"), "");
  assert.equal(extractIngredientName("to taste"), "");
  assert.ok(isWeakIngredientName("sauce"));
  assert.ok(isWeakIngredientName("finely chopped"));
});

test("ingredientName prefers clean search_key aliases", () => {
  assert.equal(
    ingredientName({ name: "spaghetti", search_key: "pasta" }),
    "pasta"
  );
  assert.equal(
    ingredientName({
      name: "garlic cloves, finely chopped",
      search_key: "chopped",
    }),
    "garlic"
  );
  assert.equal(
    ingredientName({
      name: "2 cucumbers, sliced",
      search_key: "finely chopped",
    }),
    "cucumbers"
  );
});

test("resolveSearchKey never persists prep junk", () => {
  assert.equal(
    resolveSearchKey("3 garlic cloves, finely chopped", "chopped"),
    "garlic"
  );
  assert.equal(resolveSearchKey("spaghetti", "pasta"), "pasta");
  assert.equal(resolveSearchKey("(finely chopped)", null), "ingredient");
});
