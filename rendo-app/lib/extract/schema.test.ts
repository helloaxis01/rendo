import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExtractionJson, VISION_REQUIRED_FIELDS, VISION_SYSTEM_PROMPT } from "./schema.ts";
import { decorateExtracted, buildVisionUserPrompt } from "./schema.ts";
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
  assert.equal(recipe.ingredients_normalized[0]?.name, "whole chicken");
  assert.equal(recipe.ingredients_normalized[0]?.amount, 1);
  assert.equal(recipe.ingredients_normalized[1]?.unit, "tbsp");
  assert.equal(recipe.ingredients_normalized[1]?.amount, 2);
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

test("vision prompt labels sequential capture frames", () => {
  const prompt = buildVisionUserPrompt({
    payload: "IMAGE FILES: 3 screenshot(s)",
    imageCount: 3,
  });
  assert.match(prompt, /sequential frames of ONE recipe/);
  assert.match(prompt, /Image 1 of 3 is page 1/);
  assert.match(prompt, /Image 3 of 3 is page 3/);
  assert.match(prompt, /Do not split pages into multiple recipes/);
  for (const field of VISION_REQUIRED_FIELDS) {
    assert.match(prompt, new RegExp(field));
    assert.match(VISION_SYSTEM_PROMPT, new RegExp(field));
  }
  assert.match(VISION_SYSTEM_PROMPT, /title: Name of the recipe/);
  assert.match(
    VISION_SYSTEM_PROMPT,
    /source_account: Instagram handle\/creator source name/
  );
  assert.match(
    VISION_SYSTEM_PROMPT,
    /ingredients: Array of items with parsed quantities and units/
  );
  assert.match(
    VISION_SYSTEM_PROMPT,
    /instructions: Sequential step-by-step directions/
  );
  assert.match(
    VISION_SYSTEM_PROMPT,
    /prep_time: Extracted prep duration \(if present\)/
  );
  assert.match(
    VISION_SYSTEM_PROMPT,
    /cook_time: Extracted cook duration \(if present\)/
  );
  assert.match(
    VISION_SYSTEM_PROMPT,
    /servings: Parsed yield\/yield count \(if present\)/
  );
  assert.match(VISION_SYSTEM_PROMPT, /memory_notes:/);
  assert.match(VISION_SYSTEM_PROMPT, /confidence_score/);
  assert.match(VISION_SYSTEM_PROMPT, /preparation_notes/);
});

test("vision memory_notes become kitchen_notes and ingredient fidelity is kept", () => {
  const parsed = parseExtractionJson(
    JSON.stringify({
      recipes: [
        {
          title: "Granny's Biscuits",
          memory_notes: "Thanksgiving 1998 — use the blue bowl",
          ingredients: [
            {
              raw_text: "2 cups flour, sifted",
              amount: 2,
              unit: "cup",
              name: "flour",
              preparation_notes: "sifted",
              confidence_score: 0.6,
            },
          ],
          instructions: ["Mix and bake."],
        },
      ],
    })
  );
  const recipe = decorateExtracted(parsed.recipes[0], undefined, null, {
    preserveOcrLines: true,
  });
  assert.equal(recipe.kitchen_notes[0]?.text, "Thanksgiving 1998 — use the blue bowl");
  assert.equal(recipe.ingredients_normalized[0]?.raw_text, "2 cups flour, sifted");
  assert.equal(recipe.ingredients_normalized[0]?.preparation_notes, "sifted");
  assert.equal(recipe.ingredients_normalized[0]?.confidence_score, 0.6);
  assert.equal(recipe.ingredients_normalized[0]?.name, "flour");
});

test("structured vision JSON with required object fields is kept", () => {
  const parsed = parseExtractionJson(
    JSON.stringify({
      recipes: [
        {
          title: "Garlic Pasta",
          source_account: "pasta_lab",
          ingredients: [
            { amount: 1, unit: "lb", name: "spaghetti" },
            { amount: 3, unit: null, name: "garlic cloves" },
          ],
          instructions: [
            {
              step_number: 1,
              action_header: "BOIL PASTA",
              instruction: "Boil the spaghetti until al dente.",
              timer_seconds: 600,
            },
            {
              step_number: 2,
              action_header: "TOSS",
              instruction: "Toss with garlic and oil.",
              timer_seconds: null,
            },
          ],
          prep_time: 20,
          cook_time: 12,
          servings: 4,
        },
      ],
    })
  );
  const recipe = decorateExtracted(parsed.recipes[0], undefined, null, {
    preserveOcrLines: true,
  });
  assert.equal(recipe.title, "Garlic Pasta");
  assert.equal(recipe.source_handle, "@pasta_lab");
  assert.equal(recipe.prep_time_minutes, 20);
  assert.equal(recipe.cook_time_minutes, 12);
  assert.equal(recipe.servings_base, 4);
  assert.equal(recipe.ingredients_normalized[0]?.name, "spaghetti");
  assert.equal(recipe.ingredients_normalized[0]?.amount, 1);
  assert.match(recipe.steps[0]?.instruction ?? "", /Boil the spaghetti/);
  assert.equal(isWeakRecipe(recipe, { fromMedia: true }), false);
});

test("vision prep_time maps onto recipe prep_time_minutes", () => {
  const fromMinutes = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], prep_time: 15 }],
      })
    ).recipes[0]
  );
  assert.equal(fromMinutes.prep_time_minutes, 15);

  const fromDuration = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], prep_time: "1 hour" }],
      })
    ).recipes[0]
  );
  assert.equal(fromDuration.prep_time_minutes, 60);

  const missing = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], prep_time: null }],
      })
    ).recipes[0]
  );
  assert.equal(missing.prep_time_minutes, 25);
});

test("vision cook_time maps onto recipe cook_time_minutes", () => {
  const fromMinutes = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], cook_time: 40 }],
      })
    ).recipes[0]
  );
  assert.equal(fromMinutes.cook_time_minutes, 40);

  const fromDuration = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], cook_time: "1 hour" }],
      })
    ).recipes[0]
  );
  assert.equal(fromDuration.cook_time_minutes, 60);

  const missing = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], cook_time: null }],
      })
    ).recipes[0]
  );
  assert.equal(missing.cook_time_minutes, null);
});

test("vision servings maps onto recipe servings_base", () => {
  const fromCount = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], servings: 6 }],
      })
    ).recipes[0]
  );
  assert.equal(fromCount.servings_base, 6);

  const fromYield = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], servings: "Serves 8–10" }],
      })
    ).recipes[0]
  );
  assert.equal(fromYield.servings_base, 8);

  const missing = decorateExtracted(
    parseExtractionJson(
      JSON.stringify({
        recipes: [{ title: "Soup", ingredients: ["stock"], instructions: ["Simmer."], servings: null }],
      })
    ).recipes[0]
  );
  assert.equal(missing.servings_base, 4);
});
