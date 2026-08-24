import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodedBase64Bytes,
  imageCompressOptions,
  maxBytesPerImage,
  MAX_TOTAL_MEDIA_BYTES,
  TARGET_IMAGE_BYTES,
  WEBP_QUALITY,
} from "./media-budget.ts";

test("two photos split the POST budget instead of sending 2x the single-image cap", () => {
  assert.equal(maxBytesPerImage(2) * 2, MAX_TOTAL_MEDIA_BYTES);
  assert.ok(maxBytesPerImage(2) < maxBytesPerImage(1));
  assert.equal(imageCompressOptions(2).maxEdge, 1600);
  assert.equal(imageCompressOptions(1).quality, WEBP_QUALITY);
  assert.equal(imageCompressOptions(2).quality, WEBP_QUALITY);
  assert.ok(imageCompressOptions(1).targetBytes <= TARGET_IMAGE_BYTES);
  assert.ok(
    imageCompressOptions(1).targetBytes <= imageCompressOptions(1).maxBytes
  );
});

test("decodedBase64Bytes approximates original file size", () => {
  assert.equal(decodedBase64Bytes("AAAA"), 3);
});
