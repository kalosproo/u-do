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
