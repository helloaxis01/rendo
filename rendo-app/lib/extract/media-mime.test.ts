import assert from "node:assert/strict";
import { test } from "node:test";
import { geminiImageMime, stripBase64Prefix } from "./media-mime.ts";

test("iOS image/jpg is sent as image/jpeg", () => {
  assert.equal(geminiImageMime("image/jpg"), "image/jpeg");
  assert.equal(geminiImageMime("image/jpeg"), "image/jpeg");
  assert.equal(geminiImageMime("image/png"), "image/png");
});

test("data URL prefix is stripped before Gemini", () => {
  assert.equal(
    stripBase64Prefix("data:image/jpeg;base64,QUJD"),
    "QUJD"
  );
  assert.equal(stripBase64Prefix("QUJD"), "QUJD");
});
