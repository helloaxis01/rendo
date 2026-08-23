import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addContribution,
  groupShoppingItems,
  removeContribution,
} from "./merge.ts";
import { combineAmounts, unitsCompatible } from "./units.ts";
import { normalizeIngredientName } from "./normalize.ts";
import type { ShoppingItem } from "./types.ts";

describe("normalizeIngredientName", () => {
  it("strips filler words and punctuation", () => {
    assert.equal(
      normalizeIngredientName("Fresh Garlic, minced"),
      "garlic"
    );
  });
});

describe("unitsCompatible / combineAmounts", () => {
  it("sums volume across tsp/tbsp", () => {
    const combined = combineAmounts(3, "tsp", 1, "tbsp");
    assert.ok(combined);
    assert.equal(combined!.unit, "tbsp");
    assert.equal(combined!.amount, 2);
  });

  it("rejects volume vs mass", () => {
    assert.equal(unitsCompatible("cup", "oz"), false);
    assert.equal(combineAmounts(1, "cup", 2, "oz"), null);
  });

  it("sums matching count units", () => {
    assert.deepEqual(combineAmounts(2, "cloves", 3, "cloves"), {
      amount: 5,
      unit: "cloves",
    });
  });
});

describe("shopping list merge (recipe sections stay separate)", () => {
  it("merges the same ingredient from two recipes when units combine", () => {
    let items: ShoppingItem[] = [];
    items = addContribution(items, {
      recipe_id: "r1",
      recipe_title: "Pasta",
      ingredient_id: "i1",
      name: "Olive oil",
      amount: 2,
      unit: "tbsp",
    });
    items = addContribution(items, {
      recipe_id: "r2",
      recipe_title: "Salad",
      ingredient_id: "i9",
      name: "olive oil",
      amount: 1,
      unit: "tbsp",
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].amount, 3);
    assert.equal(items[0].sources.length, 2);
  });

  it("keeps separate lines when units cannot combine, grouped by name", () => {
    let items: ShoppingItem[] = [];
    items = addContribution(items, {
      recipe_id: "r1",
      recipe_title: "Pasta",
      ingredient_id: "i1",
      name: "Butter",
      amount: 4,
      unit: "tbsp",
    });
    items = addContribution(items, {
      recipe_id: "r2",
      recipe_title: "Cake",
      ingredient_id: "i2",
      name: "Butter",
      amount: 100,
      unit: "g",
    });
    assert.equal(items.length, 2);
    const groups = groupShoppingItems(items);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].items.length, 2);
  });

  it("merges sauce + main amounts onto one shopping line", () => {
    let items: ShoppingItem[] = [];
    items = addContribution(items, {
      recipe_id: "r1",
      recipe_title: "Tacos",
      ingredient_id: "sauce-lime",
      name: "Lime juice",
      amount: 2,
      unit: "tbsp",
    });
    items = addContribution(items, {
      recipe_id: "r1",
      recipe_title: "Tacos",
      ingredient_id: "meat-lime",
      name: "lime juice",
      amount: 1,
      unit: "tbsp",
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].amount, 3);
    assert.equal(items[0].sources.length, 2);
  });

  it("removeContribution recomputes and drops empty items", () => {
    let items: ShoppingItem[] = [];
    items = addContribution(items, {
      recipe_id: "r1",
      recipe_title: "Pasta",
      ingredient_id: "i1",
      name: "Salt",
      amount: 1,
      unit: "tsp",
    });
    items = addContribution(items, {
      recipe_id: "r2",
      recipe_title: "Soup",
      ingredient_id: "i2",
      name: "Salt",
      amount: 1,
      unit: "tsp",
    });
    items = removeContribution(items, "r1", "i1");
    assert.equal(items.length, 1);
    assert.equal(items[0].amount, 1);
    items = removeContribution(items, "r2", "i2");
    assert.equal(items.length, 0);
  });
});
