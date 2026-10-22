import { test } from "node:test";
import assert from "node:assert/strict";

import { friendlyError } from "./friendlyError.js";

test("rules refusals and missing functions read as not ready, not as a bad connection", () => {
  assert.match(friendlyError({ code: "permission-denied" }), /isn't switched on yet/);
  assert.match(friendlyError({ code: "functions/not-found" }), /isn't switched on yet/);
  assert.match(friendlyError({ code: "functions/failed-precondition" }), /isn't switched on yet/);
});

test("anything else falls back", () => {
  assert.equal(friendlyError({ code: "unavailable" }, "Couldn't save."), "Couldn't save.");
  assert.equal(friendlyError(null), "Something went wrong. Try again.");
});

test("camera and mic problems say what to do", () => {
  assert.match(friendlyError({ name: "NotAllowedError" }), /Allow the camera and microphone/);
  assert.match(friendlyError({ name: "NotFoundError" }), /No camera or microphone/);
  assert.match(friendlyError({ name: "NotReadableError" }), /Another app/);
});

test("messages written for people pass through", () => {
  assert.equal(friendlyError({ userFacing: true, message: "The call is full." }), "The call is full.");
  assert.equal(friendlyError({ message: "internal detail" }, "Try again."), "Try again.");
});
