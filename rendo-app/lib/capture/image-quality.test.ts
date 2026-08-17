import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOW_CONTRAST_PHOTO_MESSAGE,
  qualityIssueFromRgba,
  TOO_BRIGHT_PHOTO_MESSAGE,
  TOO_DARK_PHOTO_MESSAGE,
  messageForImageQuality,
} from "./image-quality.ts";
import { publicImportError } from "./import-errors.ts";

const W = 32;
const H = 32;

function solid(r: number, g: number, b: number) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function recipeCard() {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const ink = y % 4 === 0 || x % 8 === 0;
      const v = ink ? 28 : 236;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

test("solid black and near-black frames are too dark", () => {
  assert.equal(qualityIssueFromRgba(solid(0, 0, 0), W, H), "too-dark");
  assert.equal(qualityIssueFromRgba(solid(12, 10, 8), W, H), "too-dark");
});

test("blown-out white frames are too bright", () => {
  assert.equal(qualityIssueFromRgba(solid(255, 255, 255), W, H), "too-bright");
  assert.equal(qualityIssueFromRgba(solid(252, 250, 248), W, H), "too-bright");
});

test("flat gray has no text contrast", () => {
  assert.equal(qualityIssueFromRgba(solid(140, 140, 140), W, H), "low-contrast");
});

test("a high-contrast recipe card still passes", () => {
  assert.equal(qualityIssueFromRgba(recipeCard(), W, H), null);
});

test("quality issues map to the public photo errors", () => {
  assert.equal(
    publicImportError(messageForImageQuality("too-dark"), "photo"),
    TOO_DARK_PHOTO_MESSAGE
  );
  assert.equal(
    publicImportError(messageForImageQuality("too-bright"), "photo"),
    TOO_BRIGHT_PHOTO_MESSAGE
  );
  assert.equal(
    publicImportError(messageForImageQuality("low-contrast"), "photo"),
    LOW_CONTRAST_PHOTO_MESSAGE
  );
  assert.equal(
    publicImportError(`Photo 2 of 4: ${TOO_DARK_PHOTO_MESSAGE}`, "photo"),
    `Photo 2 of 4: ${TOO_DARK_PHOTO_MESSAGE}`
  );
});
