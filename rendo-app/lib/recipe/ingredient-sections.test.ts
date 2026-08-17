import assert from "node:assert/strict";
import { test } from "node:test";
import { groupIngredientsBySection } from "../recipe/ingredient-sections.ts";

test("groupIngredientsBySection keeps duplicate names in different sections", () => {
  const groups = groupIngredientsBySection([
    {
      id: "ing_1",
      amount: 0.25,
      unit: "cup",
      name: "olive oil",
      search_key: "oil",
      section: null,
    },
    {
      id: "ing_2",
      amount: 0.25,
      unit: "cup",
      name: "olive oil",
      search_key: "oil",
      section: "For the Salad",
    },
    {
      id: "ing_3",
      amount: 0.5,
      unit: "cup",
      name: "olive oil",
      search_key: "oil",
      section: "For the Salsa Verde",
    },
  ]);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].section, null);
  assert.equal(groups[1].section, "For the Salad");
  assert.equal(groups[1].items.length, 1);
  assert.equal(groups[2].section, "For the Salsa Verde");
  assert.equal(groups[2].items.length, 1);
});
