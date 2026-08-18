import assert from "node:assert/strict";
import { test } from "node:test";
import type { Recipe } from "../db/types.ts";
import {
  cookedThisMonthRecipes,
  libraryShelves,
  quickWeeknightRecipes,
  uncookedShelfRecipes,
} from "./shelves.ts";

function recipe(patch: Partial<Recipe> & Pick<Recipe, "id" | "title">): Recipe {
  return {
    source_handle: null,
    source_url: null,
    prep_time_minutes: 25,
    servings_base: 4,
    cover_image_url: null,
    is_favorite: false,
    tags: [],
    ingredients_normalized: [],
    steps: [],
    kitchen_notes: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    cooked: false,
    ...patch,
  };
}

test("uncooked shelf is oldest-first and hides cooked recipes", () => {
  const recipes = [
    recipe({
      id: "new",
      title: "New",
      created_at: "2026-08-01T00:00:00.000Z",
    }),
    recipe({
      id: "old",
      title: "Old",
      created_at: "2026-01-01T00:00:00.000Z",
    }),
    recipe({
      id: "mid",
      title: "Mid",
      created_at: "2026-04-01T00:00:00.000Z",
    }),
    recipe({
      id: "done",
      title: "Done",
      created_at: "2025-01-01T00:00:00.000Z",
      cooked: true,
      last_cooked_at: "2026-08-01T00:00:00.000Z",
    }),
  ];
  const shelf = uncookedShelfRecipes(recipes);
  assert.deepEqual(
    shelf.map((item) => item.id),
    ["old", "mid", "new"]
  );
});

test("uncooked shelf stays hidden when fewer than three recipes qualify", () => {
  const recipes = [
    recipe({ id: "a", title: "A" }),
    recipe({ id: "b", title: "B" }),
  ];
  assert.deepEqual(uncookedShelfRecipes(recipes), []);
});

test("cooked-this-month uses the local calendar month, newest first", () => {
  const now = new Date("2026-08-17T12:00:00");
  const recipes = [
    recipe({
      id: "july",
      title: "July",
      cooked: true,
      last_cooked_at: "2026-07-30T12:00:00.000Z",
    }),
    recipe({
      id: "early",
      title: "Early August",
      cooked: true,
      last_cooked_at: "2026-08-02T12:00:00.000Z",
    }),
    recipe({
      id: "late",
      title: "Late August",
      cooked: true,
      last_cooked_at: "2026-08-16T12:00:00.000Z",
    }),
    recipe({
      id: "mid",
      title: "Mid August",
      cooked: true,
      last_cooked_at: "2026-08-10T12:00:00.000Z",
    }),
    recipe({
      id: "uncooked",
      title: "Uncooked",
    }),
  ];
  const shelf = cookedThisMonthRecipes(recipes, now);
  assert.deepEqual(
    shelf.map((item) => item.id),
    ["late", "mid", "early"]
  );
});

test("quick weeknight only uses cook_time_minutes, not prep time", () => {
  const recipes = [
    recipe({
      id: "prep-only",
      title: "Prep only",
      prep_time_minutes: 10,
    }),
    recipe({
      id: "quick",
      title: "Quick",
      cook_time_minutes: 15,
    }),
    recipe({
      id: "also-quick",
      title: "Also quick",
      cook_time_minutes: 25,
    }),
    recipe({
      id: "slow",
      title: "Slow",
      cook_time_minutes: 90,
    }),
    recipe({
      id: "fastest",
      title: "Fastest",
      cook_time_minutes: 8,
    }),
  ];
  const shelf = quickWeeknightRecipes(recipes);
  assert.deepEqual(
    shelf.map((item) => item.id),
    ["fastest", "quick", "also-quick"]
  );
});

test("libraryShelves hides empty rows and leads with uncooked", () => {
  const now = new Date("2026-08-17T12:00:00");
  const recipes = [
    recipe({
      id: "a",
      title: "A",
      created_at: "2026-01-01T00:00:00.000Z",
    }),
    recipe({
      id: "b",
      title: "B",
      created_at: "2026-02-01T00:00:00.000Z",
    }),
    recipe({
      id: "c",
      title: "C",
      created_at: "2026-03-01T00:00:00.000Z",
    }),
  ];
  const shelves = libraryShelves(recipes, now);
  assert.deepEqual(
    shelves.map((shelf) => shelf.id),
    ["uncooked"]
  );
  assert.equal(shelves[0]?.label, "Saved, Not Cooked Yet");
});
