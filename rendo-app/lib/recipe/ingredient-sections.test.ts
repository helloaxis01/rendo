import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ingredient, Recipe } from "../db/types.ts";
import {
  acceptReimportedIngredients,
  applyAssignedSections,
  groupIngredientsBySection,
  needsIngredientSections,
} from "../recipe/ingredient-sections.ts";

function oil(id: string, section: string | null = null): Ingredient {
  return {
    id,
    amount: 0.25,
    unit: "cup",
    name: "olive oil",
    search_key: "oil",
    section,
    checked: false,
  };
}

function recipe(ingredients: Ingredient[], steps = ""): Recipe {
  return {
    id: "rec_test",
    title: "Steak",
    source_handle: null,
    source_url: "https://example.com/steak",
    prep_time_minutes: 25,
    servings_base: 4,
    cover_image_url: null,
    is_favorite: false,
    tags: [],
    ingredients_normalized: ingredients,
    steps: steps
      ? [
          {
            step_number: 1,
            action_header: "MAKE",
            instruction: steps,
          },
        ]
      : [],
    kitchen_notes: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

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

test("needsIngredientSections catches duplicate oils with no headings", () => {
  assert.equal(
    needsIngredientSections(recipe([oil("ing_1"), oil("ing_2"), oil("ing_3"), {
      id: "ing_4",
      amount: 1,
      unit: "lb",
      name: "steak",
      search_key: "steak",
      checked: false,
    }])),
    true
  );
  assert.equal(
    needsIngredientSections(
      recipe([
        oil("ing_1", "For the steak"),
        oil("ing_2", "For the salad"),
        oil("ing_3", "For the salsa"),
        {
          id: "ing_4",
          amount: 1,
          unit: "lb",
          name: "steak",
          search_key: "steak",
          section: "For the steak",
          checked: false,
        },
      ])
    ),
    false
  );
});

test("acceptReimportedIngredients keeps extra oils when headings return", () => {
  const current = [oil("ing_1"), {
    id: "ing_2",
    amount: 1,
    unit: "lb",
    name: "steak",
    search_key: "steak",
    checked: true,
  }, oil("ing_3"), {
    id: "ing_4",
    amount: 2,
    unit: "cup",
    name: "lettuce",
    search_key: "lettuce",
    checked: false,
  }];
  const incoming = [
    { ...oil("ing_1", "For the steak") },
    {
      id: "ing_2",
      amount: 1,
      unit: "lb",
      name: "steak",
      search_key: "steak",
      section: "For the steak",
      checked: false,
    },
    { ...oil("ing_3", "For the salad") },
    {
      id: "ing_4",
      amount: 2,
      unit: "cup",
      name: "lettuce",
      search_key: "lettuce",
      section: "For the salad",
      checked: false,
    },
  ];
  const next = acceptReimportedIngredients(current, incoming);
  assert.equal(next?.[1]?.checked, true);
  assert.equal(next?.[0]?.section, "For the steak");
  assert.equal(next?.[2]?.section, "For the salad");
});

test("applyAssignedSections maps headings onto saved lines", () => {
  const next = applyAssignedSections(
    [oil("ing_1"), oil("ing_2")],
    [
      { id: "ing_1", section: "Marinade:" },
      { id: "ing_2", section: "Dressing" },
    ]
  );
  assert.equal(next?.[0]?.section, "Marinade");
  assert.equal(next?.[1]?.section, "Dressing");
});
