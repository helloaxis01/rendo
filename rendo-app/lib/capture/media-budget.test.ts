import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodedBase64Bytes,
  imageCompressOptions,
  maxBytesPerImage,
  MAX_TOTAL_MEDIA_BYTES,
} from "./media-budget.ts";
import {
  isRetryableExtractFailure,
  publicImportError,
} from "./import-errors.ts";

test("two photos split the POST budget instead of sending 2x the single-image cap", () => {
  assert.equal(maxBytesPerImage(2) * 2, MAX_TOTAL_MEDIA_BYTES);
  assert.ok(maxBytesPerImage(2) < maxBytesPerImage(1));
  assert.equal(imageCompressOptions(2).maxEdge, 1600);
  assert.ok(imageCompressOptions(2).quality < imageCompressOptions(1).quality);
});

test("decodedBase64Bytes approximates original file size", () => {
  assert.equal(decodedBase64Bytes("AAAA"), 3);
});

test("Load failed becomes a human photo message", () => {
  assert.match(
    publicImportError("TypeError: Load failed"),
    /couldn't read those photos/i
  );
  assert.match(publicImportError("413 Payload Too Large"), /too large/i);
});

test("network extract failures are retryable", () => {
  assert.equal(isRetryableExtractFailure(new Error("Load failed")), true);
  assert.equal(isRetryableExtractFailure(new Error("Failed to fetch")), true);
  assert.equal(isRetryableExtractFailure(new Error("Gemini API key invalid")), false);
});
