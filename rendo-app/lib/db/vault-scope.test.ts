import assert from "node:assert/strict";
import test from "node:test";
import { isSeedRecipeId, SEED_RECIPE_IDS } from "@/data/seed-recipes";
import {
  mutationIsSeedRecipe,
  recipesForCloudPush,
} from "@/lib/db/vault-scope";
import type { Recipe, SyncMutation } from "@/lib/db/types";

test("isSeedRecipeId recognizes demo recipes", () => {
  assert.equal(isSeedRecipeId("rec_tuscan_chicken"), true);
  assert.equal(isSeedRecipeId("rec_user_created"), false);
  assert.equal(SEED_RECIPE_IDS.size, 6);
});

test("recipesForCloudPush excludes demo seeds", () => {
  const recipes: Recipe[] = [
    {
      id: "rec_tuscan_chicken",
      title: "Demo",
    } as Recipe,
    {
      id: "rec_user_created",
      title: "Mine",
    } as Recipe,
  ];
  const pushed = recipesForCloudPush(recipes);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0]?.id, "rec_user_created");
});

test("mutationIsSeedRecipe ignores non-recipe entities", () => {
  const mutation: SyncMutation = {
    id: "m1",
    entity: "preference",
    operation: "upsert",
    payload: { id: "app" },
    created_at: "2026-01-01T00:00:00.000Z",
    attempts: 0,
  };
  assert.equal(mutationIsSeedRecipe(mutation), false);
});

test("mutationIsSeedRecipe flags seed upserts", () => {
  const mutation: SyncMutation = {
    id: "m2",
    entity: "recipe",
    operation: "upsert",
    payload: { id: "rec_miso_salmon" },
    created_at: "2026-01-01T00:00:00.000Z",
    attempts: 0,
  };
  assert.equal(mutationIsSeedRecipe(mutation), true);
});
