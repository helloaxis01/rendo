import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canFetchGalleryWebPath,
  filesystemPathCandidates,
} from "./photo-path.ts";

test("remote WebView must never fetch Camera webPath", () => {
  assert.equal(canFetchGalleryWebPath(), false);
});

test("Filesystem candidates include file:// and stripped forms", () => {
  const fromUrl = filesystemPathCandidates(
    "file:///var/mobile/Containers/Data/tmp/photo.jpg"
  );
  assert.ok(fromUrl.includes("file:///var/mobile/Containers/Data/tmp/photo.jpg"));
  assert.ok(fromUrl.includes("/var/mobile/Containers/Data/tmp/photo.jpg"));

  const fromPath = filesystemPathCandidates(
    "/var/mobile/Containers/Data/tmp/photo.jpg"
  );
  assert.ok(fromPath[0]?.startsWith("file://"));
  assert.deepEqual(filesystemPathCandidates(""), []);
});
