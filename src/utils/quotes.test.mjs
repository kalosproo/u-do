// Daily quote tests.   node --test src/utils/quotes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { QUOTES, quoteFor } from "./quotes.js";

test("the same quote all day", () => {
  const morning = new Date(2026, 9, 18, 0, 5);
  const night = new Date(2026, 9, 18, 23, 55);
  assert.deepEqual(quoteFor(morning), quoteFor(night));
});

test("a different quote the next day", () => {
  assert.notDeepEqual(quoteFor(new Date(2026, 9, 18, 12)), quoteFor(new Date(2026, 9, 19, 12)));
});

test("every quote comes round, and each has an author", () => {
  const seen = new Set();
  for (let i = 0; i < QUOTES.length; i += 1) seen.add(quoteFor(new Date(2026, 0, 1 + i, 12)).text);
  assert.equal(seen.size, QUOTES.length);
  for (const [text, author] of QUOTES) assert.ok(text && author);
});
