import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExtractionJson } from "./schema.ts";
import { decorateExtracted } from "./schema.ts";
import { isWeakRecipe } from "./quality.ts";

test("vision JSON with string ingredients and steps is kept", () => {
  const parsed = parseExtractionJson(
    JSON.stringify({
      recipes: [
        {
          title: "Crispy Roast Chicken",
          ingredients_normalized: [
            "1 whole chicken",
            "2 tbsp olive oil",
            "1 tsp salt",
          ],
          steps: [
            "Pat the chicken dry.",
            "Rub with oil and salt, then roast at 425F until the skin is crisp.",
          ],
        },
      ],
    })
  );
  const recipe = decorateExtracted(parsed.recipes[0]);
  assert.equal(recipe.title, "Crispy Roast Chicken");
  assert.equal(recipe.ingredients_normalized[0]?.name, "1 whole chicken");
  assert.match(recipe.steps[0]?.instruction ?? "", /Pat the chicken dry/);
  assert.equal(isWeakRecipe(recipe), false);
});

test("unwrapped recipe object is treated as recipes[0]", () => {
  const parsed = parseExtractionJson(
    JSON.stringify({
      title: "Lemon Pasta",
      ingredients: "1 lb spaghetti\n2 tbsp olive oil\n1 lemon",
      instructions: "1. Boil the pasta.\n2. Toss with oil and lemon.",
    })
  );
  const recipe = decorateExtracted(parsed.recipes[0], undefined, null, {
    preserveOcrLines: true,
  });
  assert.equal(recipe.title, "Lemon Pasta");
  assert.ok(recipe.ingredients_normalized.length >= 3);
  assert.ok(recipe.steps.length >= 2);
  assert.equal(isWeakRecipe(recipe, { fromMedia: true }), false);
});

test("photo OCR keeps short steps and Unknown titles", () => {
  const parsed = parseExtractionJson(
    JSON.stringify({
      recipes: [
        {
          title: "Unknown Recipe",
          ingredients_normalized: ["2 cups flour", "1 tsp salt"],
          steps: ["Mix well.", "Bake."],
        },
      ],
    })
  );
  const recipe = decorateExtracted(parsed.recipes[0], undefined, null, {
    preserveOcrLines: true,
  });
  assert.equal(recipe.steps.length, 2);
  assert.match(recipe.steps[0]?.instruction ?? "", /Mix well/);
  assert.equal(isWeakRecipe(recipe, { fromMedia: true }), false);
});

test("photo with only an ingredient list is still kept", () => {
  const parsed = parseExtractionJson(
    JSON.stringify({
      recipes: [
        {
          title: "Shopping list cake",
          ingredients_normalized: ["2 cups flour", "1 cup sugar", "2 eggs"],
          steps: [],
        },
      ],
    })
  );
  const recipe = decorateExtracted(parsed.recipes[0], undefined, null, {
    preserveOcrLines: true,
  });
  assert.equal(isWeakRecipe(recipe, { fromMedia: true }), false);
  assert.equal(isWeakRecipe(recipe), true);
});
