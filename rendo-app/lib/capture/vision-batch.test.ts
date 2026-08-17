import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_VISION_BATCH,
  visionBatchMedia,
  visionBatchPromptParts,
  visionBatchRequest,
} from "./vision-batch.ts";

function frame(id: string) {
  return { mimeType: "image/jpeg", data: `frame-${id}` };
}

test("a single validated image is still sent as a media array", () => {
  const body = visionBatchRequest({
    type: "upload",
    payload: "IMAGE FILES: 1 screenshot(s)",
    media: frame("a"),
  });
  assert.equal(Array.isArray(body.media), true);
  assert.equal(body.media?.length, 1);
  assert.equal(body.media?.[0]?.data, "frame-a");
});

test("the session is one batch of at most four frames", () => {
  const media = visionBatchMedia(
    Array.from({ length: 6 }, (_, i) => frame(String(i)))
  );
  assert.equal(media.length, MAX_VISION_BATCH);
  const body = visionBatchRequest({
    type: "upload",
    payload: "IMAGE FILES: 4 screenshot(s)",
    media,
  });
  assert.equal(body.media?.length, 4);
});

test("Gemini Vision parts are one request with every frame attached", () => {
  const parts = visionBatchPromptParts("IMAGE FILES: 3 screenshot(s)", [
    frame("1"),
    frame("2"),
    frame("3"),
  ]);
  const images = parts.filter((part) => "inlineData" in part);
  const labels = parts.filter(
    (part) => "text" in part && /^Image \d+ of 3/.test(part.text)
  );
  assert.equal(images.length, 3);
  assert.equal(labels.length, 3);
  assert.match(
    parts[0] && "text" in parts[0] ? parts[0].text : "",
    /sequential frames of ONE recipe/
  );
});
