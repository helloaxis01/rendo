import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecipeFromHtml, structuredFromPlainText } from "./fetch-url.ts";

const CHROME_PAGE = `<html><head><title>Lemon Cake</title></head><body>
<nav>Home About Shop</nav>
<p>start trial</p>
<p>previous next</p>
<footer>@2026 victoria minell privacy terms</footer>
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
