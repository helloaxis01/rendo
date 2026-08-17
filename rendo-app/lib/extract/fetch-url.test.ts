import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractWprmIngredientGroups,
  parseRecipeFromHtml,
  structuredFromPlainText,
} from "./fetch-url.ts";

const CHROME_PAGE = `<html><head><title>Lemon Cake</title></head><body>
<nav>Home About Shop</nav>
<p>start trial</p>
<p>previous next</p>
<footer>@2026 victoria minell privacy terms</footer>
</body></html>`;

const WPRM_HTML = `<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Grilled Flank Steak With Salsa Verde",
  "recipeIngredient": [
    "1 lb Flank Steak",
    "1/4 cup olive oil",
    "1/4 cup olive oil",
    "1/2 cup olive oil"
  ],
  "recipeInstructions": ["Marinate the steak.", "Grill the steak.", "Make the salsa."]
}
</script>
</head><body>
<div class="wprm-recipe-ingredient-group"><ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1</span> <span class="wprm-recipe-ingredient-unit">lb</span> <span class="wprm-recipe-ingredient-name">Flank Steak</span></li><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1/4</span> <span class="wprm-recipe-ingredient-unit">cup</span> <span class="wprm-recipe-ingredient-name">olive oil</span></li></ul></div>
<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-ingredient-group-name">For the Salad:</h4><ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1/4</span> <span class="wprm-recipe-ingredient-unit">cup</span> <span class="wprm-recipe-ingredient-name">olive oil</span></li><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1/4</span> <span class="wprm-recipe-ingredient-unit">cup</span> <span class="wprm-recipe-ingredient-name">fresh lemon juice</span></li></ul></div>
<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-ingredient-group-name">For the Salsa Verde:</h4><ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1/2</span> <span class="wprm-recipe-ingredient-unit">cup</span> <span class="wprm-recipe-ingredient-name">olive oil</span></li><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">2</span> <span class="wprm-recipe-ingredient-unit">tablespoons</span> <span class="wprm-recipe-ingredient-name">capers</span></li></ul></div>
</body></html>`;

test("noisy blog HTML without a recipe does not become a structured recipe", () => {
  const parsed = parseRecipeFromHtml(CHROME_PAGE, "https://example.com/cake");
  assert.equal(parsed?.structured, undefined);
  const loose = structuredFromPlainText(
    ["start trial", "previous next", "@2026 victoria minell", "privacy terms"].join(
      "\n"
    ),
    "https://example.com/cake"
  );
  assert.equal(loose, undefined);
});

test("JSON-LD Recipe is preferred over page chrome", () => {
  const html = `<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Crispy Roast Chicken",
  "recipeIngredient": ["1 whole chicken", "2 tbsp olive oil", "1 tsp salt"],
  "recipeInstructions": [
    "Pat the chicken dry.",
    "Rub with oil and salt, then roast at 425F until the skin is crisp."
  ]
}
</script>
</head><body>
<nav>start trial previous next privacy terms</nav>
</body></html>`;
  const parsed = parseRecipeFromHtml(html, "https://example.com/chicken");
  assert.ok(parsed?.structured);
  assert.equal(parsed?.structured?.title, "Crispy Roast Chicken");
  assert.equal(parsed?.structured?.ingredients_normalized.length, 3);
  assert.ok((parsed?.structured?.steps.length ?? 0) >= 2);
  assert.equal(
    parsed?.structured?.ingredients_normalized.some((ing) =>
      /trial|privacy|previous/i.test(ing.name)
    ),
    false
  );
});

test("WPRM ingredient groups preserve section headings and duplicate pantry items", () => {
  const groups = extractWprmIngredientGroups(WPRM_HTML);
  assert.equal(groups.length, 6);
  assert.equal(groups[0].section, null);
  assert.equal(groups[0].line, "1 lb Flank Steak");
  assert.equal(groups[1].line, "1/4 cup olive oil");
  assert.equal(groups[2].section, "For the Salad");
  assert.equal(groups[2].line, "1/4 cup olive oil");
  assert.equal(groups[4].section, "For the Salsa Verde");
  assert.equal(groups[4].line, "1/2 cup olive oil");

  const parsed = parseRecipeFromHtml(
    WPRM_HTML,
    "https://whatsgabycooking.com/grilled-flank-steak-salsa-verde/"
  );
  const ings = parsed?.structured?.ingredients_normalized ?? [];
  assert.equal(ings.length, 6);
  assert.equal(
    ings.filter((ing) => /olive oil/i.test(ing.name)).length,
    3
  );
  assert.equal(ings[2].section, "For the Salad");
  assert.equal(ings[4].section, "For the Salsa Verde");
});
