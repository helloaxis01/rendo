import assert from "node:assert/strict";
import { test } from "node:test";
import { planShare } from "./plan-share.ts";

test("Instagram URL without a caption asks for the website", () => {
  const plan = planShare({ url: "https://www.instagram.com/p/abc123/" });
  assert.equal(plan.kind, "need-website");
});

test("recipe-site URL is fetched", () => {
  const plan = planShare({
    url: "https://www.seriouseats.com/crispy-roast-chicken",
  });
  assert.equal(plan.kind, "extract-url");
});

test("pasted ingredients and steps go to text extract", () => {
  const plan = planShare({
    text: "Ingredients\n1 cup flour\n2 eggs\n\nDirections\nMix and bake until golden.",
  });
  assert.equal(plan.kind, "extract-text");
});

test("empty share is empty", () => {
  assert.equal(planShare({}).kind, "empty");
});

test("shared screenshots open the image session even with an Instagram URL", () => {
  const plan = planShare({
    url: "https://www.instagram.com/p/abc123/",
    images: ["AAAA"],
  });
  assert.equal(plan.kind, "extract-images");
});

test("a share-sheet image count waits for the screenshot session", () => {
  assert.equal(planShare({ imageCount: 2 }).kind, "extract-images");
});
