import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ingredient, Recipe } from "./types.ts";
import {
  mergeIngredientsPreserveSections,
  resolveRecipePullConflict,
} from "./sync-merge.ts";

function ing(
  partial: Partial<Ingredient> & Pick<Ingredient, "id" | "name">
): Ingredient {
  return {
    amount: 1,
    unit: null,
    search_key: partial.name.toLowerCase(),
    checked: false,
    section: null,
    ...partial,
  };
}

function recipe(patch: Partial<Recipe> & Pick<Recipe, "id" | "updated_at">): Recipe {
  return {
    title: "Pie",
    source_handle: null,
    source_url: null,
    prep_time_minutes: 10,
    servings_base: 8,
    cover_image_url: null,
    is_favorite: false,
    tags: [],
    ingredients_normalized: [],
    steps: [],
    kitchen_notes: [],
    created_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

test("mergeIngredientsPreserveSections keeps remote order and restores headers", () => {
  const remote = [
    ing({ id: "a", name: "flour" }),
    ing({ id: "b", name: "butter" }),
    ing({ id: "c", name: "apples" }),
  ];
  const local = [
    ing({ id: "a", name: "flour", section: "For the Crust" }),
    ing({ id: "b", name: "butter", section: "For the Crust" }),
    ing({ id: "c", name: "apples", section: "For the Filling" }),
  ];
  const merged = mergeIngredientsPreserveSections(remote, local);
  assert.deepEqual(
    merged.map((row) => row.section),
    ["For the Crust", "For the Crust", "For the Filling"]
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    ["a", "b", "c"]
  );
});

test("mergeIngredientsPreserveSections keeps remote sections when present", () => {
  const remote = [
    ing({ id: "a", name: "flour", section: "Cloud Crust" }),
    ing({ id: "b", name: "butter", section: "Cloud Crust" }),
  ];
  const local = [
    ing({ id: "a", name: "flour", section: "Local Crust" }),
    ing({ id: "b", name: "butter", section: "Local Crust" }),
  ];
  const merged = mergeIngredientsPreserveSections(remote, local);
  assert.equal(merged[0]?.section, "Cloud Crust");
});

test("resolveRecipePullConflict pushes local when local is newer", () => {
  const local = recipe({
    id: "r1",
    updated_at: "2026-08-24T12:00:00.000Z",
    title: "Local",
  });
  const remote = recipe({
    id: "r1",
    updated_at: "2026-08-24T11:00:00.000Z",
    title: "Remote",
  });
  const result = resolveRecipePullConflict(remote, local);
  assert.equal(result.pushLocal, true);
  assert.equal(result.appliedRemote, false);
  assert.equal(result.recipe.title, "Local");
});

test("resolveRecipePullConflict applies remote and restores sections", () => {
  const local = recipe({
    id: "r1",
    updated_at: "2026-08-24T11:00:00.000Z",
    ingredients_normalized: [
      ing({ id: "a", name: "flour", section: "For the Crust" }),
    ],
  });
  const remote = recipe({
    id: "r1",
    updated_at: "2026-08-24T12:00:00.000Z",
    ingredients_normalized: [ing({ id: "a", name: "flour" })],
  });
  const result = resolveRecipePullConflict(remote, local);
  assert.equal(result.appliedRemote, true);
  assert.equal(result.recipe.ingredients_normalized[0]?.section, "For the Crust");
});
