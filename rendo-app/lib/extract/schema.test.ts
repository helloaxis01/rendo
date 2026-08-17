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
