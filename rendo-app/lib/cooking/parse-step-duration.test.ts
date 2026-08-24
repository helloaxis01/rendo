import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseStepDurationSeconds,
  resolveStepTimerSeconds,
} from "./parse-step-duration.ts";

test("parses common cook durations", () => {
  assert.equal(parseStepDurationSeconds("Simmer for 8 minutes."), 8 * 60);
  assert.equal(parseStepDurationSeconds("Bake for 25 min until golden."), 25 * 60);
  assert.equal(parseStepDurationSeconds("Let rest 10 minutes."), 10 * 60);
  assert.equal(parseStepDurationSeconds("Cook 1 hour."), 3600);
  assert.equal(parseStepDurationSeconds("Whisk for 30 seconds."), 30);
});

test("uses the upper bound of a range", () => {
  assert.equal(parseStepDurationSeconds("Bake 10-12 minutes."), 12 * 60);
  assert.equal(parseStepDurationSeconds("Simmer 8 to 10 min."), 10 * 60);
});

test("parses compound hour + minute", () => {
  assert.equal(
    parseStepDurationSeconds("Roast for 1 hour 15 minutes."),
    75 * 60
  );
});

test("ignores bare numbers without a time unit", () => {
  assert.equal(parseStepDurationSeconds("Add 2 cloves garlic."), null);
  assert.equal(parseStepDurationSeconds("Preheat to 350°F."), null);
  assert.equal(parseStepDurationSeconds("Step 3 of the method."), null);
});

test("resolve prefers stored timer_seconds", () => {
  assert.equal(
    resolveStepTimerSeconds({
      timer_seconds: 120,
      instruction: "Bake for 25 minutes.",
    }),
    120
  );
  assert.equal(
    resolveStepTimerSeconds({
      timer_seconds: null,
      instruction: "Bake for 25 minutes.",
    }),
    25 * 60
  );
});
