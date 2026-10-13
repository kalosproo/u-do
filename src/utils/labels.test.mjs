// Title and import-row limits.   node --test src/utils/labels.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_FIELDS, MAX_TITLE, boundedLabelled, clipTitle } from "./labels.js";

test("titles are trimmed and capped at 200, well inside the rules' 500", () => {
  assert.equal(clipTitle("  Ship it  "), "Ship it");
  assert.equal(clipTitle("x".repeat(900)).length, MAX_TITLE);
  assert.ok(MAX_TITLE < 500);
});

test("the cap never cuts an emoji in half", () => {
  const clipped = clipTitle(`a${"😀".repeat(150)}`);
  assert.ok(clipped.length <= MAX_TITLE);
  const last = clipped.charCodeAt(clipped.length - 1);
  assert.ok(!(last >= 0xd800 && last <= 0xdbff));
});

test("Hindi and Telugu titles keep their full 200 characters", () => {
  assert.equal(clipTitle("क".repeat(300)).length, 200);
});

test("an imported row gets its title capped", () => {
  assert.equal(boundedLabelled({ title: "y".repeat(1000), status: "todo" }).title.length, 200);
});

test("an imported row the rules would refuse is dropped instead", () => {
  const huge = {}; for (let i = 0; i <= MAX_FIELDS; i += 1) huge[`f${i}`] = i;
  assert.equal(boundedLabelled(huge), null);
  assert.equal(boundedLabelled({ title: 42 }), null);
  assert.equal(boundedLabelled(null), null);
  assert.equal(boundedLabelled([]), null);
});

test("a row with no title (an old habit) passes through untouched", () => {
  const old = { type: "daily", completedDays: {} };
  assert.deepEqual(boundedLabelled(old), old);
});
