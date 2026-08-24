import assert from "node:assert/strict";
import { test } from "node:test";
import { SchemaType } from "@google/generative-ai";
import { VISION_REQUIRED_FIELDS } from "./schema.ts";
import { VISION_RESPONSE_SCHEMA } from "./vision-schema.ts";

test("vision response schema requires one aggregated recipe", () => {
  assert.equal(VISION_RESPONSE_SCHEMA.type, SchemaType.OBJECT);
  assert.deepEqual(VISION_RESPONSE_SCHEMA.required, ["recipes"]);
  const recipes = VISION_RESPONSE_SCHEMA.properties?.recipes;
  assert.ok(recipes && recipes.type === SchemaType.ARRAY);
  assert.equal(recipes.maxItems, 1);
  assert.equal(recipes.minItems, 1);
  assert.ok(recipes.items && recipes.items.type === SchemaType.OBJECT);
  assert.deepEqual([...VISION_REQUIRED_FIELDS], [
    "title",
    "source_account",
    "ingredients",
    "instructions",
    "prep_time",
    "cook_time",
    "servings",
  ]);
  assert.deepEqual(recipes.items.required, [...VISION_REQUIRED_FIELDS]);
  assert.equal(
    recipes.items.properties?.title?.description,
    "Name of the recipe"
  );
  assert.equal(
    recipes.items.properties?.source_account?.description,
    "Instagram handle/creator source name"
  );
  assert.equal(
    recipes.items.properties?.ingredients?.description,
    "Array of items with parsed quantities and units"
  );
  assert.equal(
    recipes.items.properties?.instructions?.description,
    "Sequential step-by-step directions"
  );
  assert.equal(
    recipes.items.properties?.prep_time?.description,
    "Extracted prep duration (if present)"
  );
  assert.equal(
    recipes.items.properties?.cook_time?.description,
    "Extracted cook duration (if present)"
  );
  assert.equal(
    recipes.items.properties?.servings?.description,
    "Parsed yield/yield count (if present)"
  );
  assert.ok(recipes.items.properties?.memory_notes);
  assert.ok(
    recipes.items.properties?.ingredients?.items?.properties?.confidence_score
  );
  assert.ok(
    recipes.items.properties?.ingredients?.items?.properties?.raw_text
  );
  assert.ok(
    recipes.items.properties?.ingredients?.items?.properties?.preparation_notes
  );
});
