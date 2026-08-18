import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendCookEvent,
  applyLatestCookMemory,
  backfillCookEvents,
  cookEventHasMemory,
  mergeCookEvents,
  popLatestCookEvent,
  rememberCook,
  setLatestCookedAt,
  sortCookEvents,
  withDerivedCooked,
} from "./cook-events.ts";
import type { Recipe } from "./types.ts";

function recipe(patch: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Pasta",
    source_handle: null,
    source_url: null,
    prep_time_minutes: 20,
    servings_base: 4,
    cover_image_url: null,
    is_favorite: false,
    tags: [],
    ingredients_normalized: [],
    steps: [],
    kitchen_notes: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

test("uncooked recipes have no cook events", () => {
  assert.deepEqual(backfillCookEvents(recipe()), []);
  const derived = withDerivedCooked(recipe());
  assert.equal(derived.cooked, false);
  assert.equal(derived.times_cooked, 0);
  assert.equal(derived.last_cooked_at, null);
});

test("legacy cooked flag backfills a single date-only event", () => {
  const events = backfillCookEvents(
    recipe({
      cooked: true,
      times_cooked: 3,
      last_cooked_at: "2026-08-01T12:00:00.000Z",
    })
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.cooked_at, "2026-08-01T12:00:00.000Z");
  assert.equal(cookEventHasMemory(events[0]!), false);
});

test("appending a cook keeps the times-cooked count and last date in sync", () => {
  const first = appendCookEvent(
    recipe(),
    "2026-08-10T12:00:00.000Z"
  ).recipe;
  assert.equal(first.cooked, true);
  assert.equal(first.times_cooked, 1);
  assert.equal(first.last_cooked_at, "2026-08-10T12:00:00.000Z");
  assert.equal(first.cook_events?.length, 1);

  const second = appendCookEvent(
    first,
    "2026-08-17T12:00:00.000Z",
    { occasion: "Mom's birthday", who: ["Mom"], note: "doubled the garlic" }
  ).recipe;
  assert.equal(second.times_cooked, 2);
  assert.equal(second.last_cooked_at, "2026-08-17T12:00:00.000Z");
  const newest = sortCookEvents(second.cook_events ?? [])[0];
  assert.equal(newest?.occasion, "Mom's birthday");
  assert.deepEqual(newest?.who, ["Mom"]);
  assert.equal(cookEventHasMemory(newest!), true);
});

test("undo pops the latest event and restores the previous date", () => {
  let next = appendCookEvent(recipe(), "2026-08-10T12:00:00.000Z").recipe;
  next = appendCookEvent(next, "2026-08-17T12:00:00.000Z").recipe;
  next = popLatestCookEvent(next);
  assert.equal(next.times_cooked, 1);
  assert.equal(next.last_cooked_at, "2026-08-10T12:00:00.000Z");
  next = popLatestCookEvent(next);
  assert.equal(next.cooked, false);
  assert.equal(next.times_cooked, 0);
  assert.equal(next.cook_events?.length, 0);
});

test("legacy times-cooked higher than event count decrements without wiping history", () => {
  const next = popLatestCookEvent(
    recipe({
      cooked: true,
      times_cooked: 5,
      last_cooked_at: "2026-08-01T12:00:00.000Z",
    })
  );
  assert.equal(next.times_cooked, 4);
  assert.equal(next.cooked, true);
  assert.equal(next.cook_events?.length, 1);
});

test("editing last cooked updates the most recent event date", () => {
  let next = appendCookEvent(recipe(), "2026-08-10T12:00:00.000Z").recipe;
  next = setLatestCookedAt(next, "2026-08-12T12:00:00.000Z");
  assert.equal(next.last_cooked_at, "2026-08-12T12:00:00.000Z");
  assert.equal(next.cook_events?.[0]?.cooked_at, "2026-08-12T12:00:00.000Z");
});

test("rememberCook fills a date-only cook, then logs a new one", () => {
  const first = rememberCook(recipe(), {
    cooked_at: "2026-08-17T12:00:00.000Z",
    occasion: "Sunday dinner",
    who: ["Mom"],
    note: "more lemon",
  });
  assert.equal(first.times_cooked, 1);
  assert.equal(first.cook_events?.[0]?.occasion, "Sunday dinner");

  const second = rememberCook(first, {
    cooked_at: "2026-08-18T12:00:00.000Z",
    who: ["Dad"],
  });
  assert.equal(second.times_cooked, 2);
  const newest = sortCookEvents(second.cook_events ?? [])[0];
  assert.deepEqual(newest?.who, ["Dad"]);
});

test("latest memory attaches without creating another cook", () => {
  const cooked = appendCookEvent(recipe(), "2026-08-17T12:00:00.000Z").recipe;
  const remembered = applyLatestCookMemory(cooked, {
    occasion: "Sunday dinner",
    who: ["Dad", "Maya"],
    note: "better with more lemon",
  });
  assert.equal(remembered.times_cooked, 1);
  assert.equal(remembered.cook_events?.[0]?.occasion, "Sunday dinner");
  assert.deepEqual(remembered.cook_events?.[0]?.who, ["Dad", "Maya"]);
});

test("merge keeps local memories when remote has an empty log", () => {
  const local = appendCookEvent(
    recipe(),
    "2026-08-17T12:00:00.000Z",
    { occasion: "Birthday" }
  ).recipe.cook_events;
  const merged = mergeCookEvents([], local);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.occasion, "Birthday");
});
