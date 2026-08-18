import assert from "node:assert/strict";
import { test } from "node:test";
import { explainInstagramCaptionGate } from "./instagram.ts";

const SAMPLES: Array<{
  name: string;
  text: string;
  expectPass: boolean;
}> = [
  {
    name: "share chrome",
    text: "Check out this reel https://www.instagram.com/reel/abc/",
    expectPass: false,
  },
  {
    name: "link in bio hype",
    text: "Link in bio ❤️ https://www.instagram.com/p/abc/",
    expectPass: false,
  },
  {
    name: "vibes only",
    text: "Sunday dinner vibes 🔥🔥",
    expectPass: false,
  },
  {
    name: "hype under 40",
    text: "The best chicken ever!!!",
    expectPass: false,
  },
  {
    name: "recipe in comments",
    text: "Recipe in comments",
    expectPass: false,
  },
  {
    name: "shorthand just under 40 with recipe hints",
    text: "1c oats, 2c milk, pinch salt. simmer 10.",
    expectPass: true,
  },
  {
    name: "full caption with ingredients and method",
    text: "Ingredients: 1 lb chicken, 2 tbsp olive oil, salt, pepper. Grill 6 min per side until charred.",
    expectPass: true,
  },
  {
    name: "emoji-heavy but complete recipe",
    text: "🍋 Garlic lemon pasta ✨\n1 lb spaghetti\n4 cloves garlic\n1 lemon\nolive oil\nBoil pasta. Sauté garlic. Toss with lemon and oil. #dinner #pasta #recipe",
    expectPass: true,
  },
];

for (const sample of SAMPLES) {
  test(`caption gate: ${sample.name}`, () => {
    const decision = explainInstagramCaptionGate(sample.text);
    assert.equal(
      decision.pass,
      sample.expectPass,
      `${sample.name}: length ${decision.captionLength} (${decision.reason})`
    );
  });
}
