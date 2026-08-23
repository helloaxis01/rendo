import assert from "node:assert/strict";
import { test } from "node:test";
import { SAVE_CAPTURES_TO_GALLERY } from "../native/pick-image.ts";
import {
  appendPhotoSession,
  clearPhotoSession,
  getPhotoSession,
  MAX_SESSION_PHOTOS,
  removePhotoSessionAt,
  replacePhotoSession,
  writesCapturesToPhotoLibrary,
} from "./photo-session.ts";

function fakeFile(name: string) {
  return new File([name], name, { type: "image/jpeg" });
}

test("captures stay in a temporary in-memory session array", () => {
  clearPhotoSession();
  appendPhotoSession(fakeFile("one.jpg"));
  appendPhotoSession([fakeFile("two.jpg"), fakeFile("three.jpg")]);
  assert.equal(getPhotoSession().length, 3);
  assert.equal(getPhotoSession()[0]?.name, "one.jpg");
  removePhotoSessionAt(1);
  assert.deepEqual(
    getPhotoSession().map((file) => file.name),
    ["one.jpg", "three.jpg"]
  );
  replacePhotoSession([fakeFile("a.jpg"), fakeFile("b.jpg")]);
  assert.equal(getPhotoSession().length, 2);
  clearPhotoSession();
  assert.equal(getPhotoSession().length, 0);
});

test("the session never exceeds six frames and never writes to Photos", () => {
  clearPhotoSession();
  appendPhotoSession(
    Array.from({ length: 6 }, (_, i) => fakeFile(`${i}.jpg`))
  );
  assert.equal(getPhotoSession().length, MAX_SESSION_PHOTOS);
  assert.equal(writesCapturesToPhotoLibrary(), false);
  assert.equal(SAVE_CAPTURES_TO_GALLERY, false);
  clearPhotoSession();
});
