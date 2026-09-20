// Recurrence tests.
//
//   node --test src/utils/recurrence.test.mjs
//
// Dates are the classic place to ship a bug nobody notices for a month: the
// 31st in February, a weekly rule that skips its own weekday, a "next" that
// lands on today and nags instantly. All of it is pure arithmetic, so all of
// it is checkable here rather than by waiting a week.
import test from "node:test";
import assert from "node:assert/strict";

import {
  describeRepeat,
  isRepeating,
  nextOccurrence,
  normalizeRepeat,
} from "./recurrence.js";

const weekly = (...days) => ({ kind: "weekly", days });

test("no repeat has no next date", () => {
  assert.equal(nextOccurrence("2026-09-20", { kind: "none" }), "");
  assert.equal(nextOccurrence("2026-09-20", undefined), "");
});

test("daily moves one day, including across a month end", () => {
  assert.equal(nextOccurrence("2026-09-20", { kind: "daily" }), "2026-09-21");
  assert.equal(nextOccurrence("2026-09-30", { kind: "daily" }), "2026-10-01");
  assert.equal(nextOccurrence("2026-12-31", { kind: "daily" }), "2027-01-01");
});

test("daily crosses a leap day correctly", () => {
  assert.equal(nextOccurrence("2028-02-28", { kind: "daily" }), "2028-02-29");
  assert.equal(nextOccurrence("2026-02-28", { kind: "daily" }), "2026-03-01");
});

test("weekly finds the next chosen weekday", () => {
  // 2026-09-20 is a Sunday.
  assert.equal(new Date("2026-09-20T00:00:00Z").getUTCDay(), 0);
  assert.equal(nextOccurrence("2026-09-20", weekly(1, 3, 5)), "2026-09-21");
  assert.equal(nextOccurrence("2026-09-21", weekly(1, 3, 5)), "2026-09-23");
  assert.equal(nextOccurrence("2026-09-23", weekly(1, 3, 5)), "2026-09-25");
  assert.equal(nextOccurrence("2026-09-25", weekly(1, 3, 5)), "2026-09-28");
});

test("a weekly rule on one day wraps a full week, never to itself", () => {
  const next = nextOccurrence("2026-09-21", weekly(1));
  assert.equal(next, "2026-09-28");
  assert.notEqual(next, "2026-09-21");
});

test("the next date is always strictly after the one given", () => {
  // An occurrence dated today would be overdue the instant it was created.
  for (const rule of [{ kind: "daily" }, weekly(0, 1, 2, 3, 4, 5, 6), { kind: "monthly" }]) {
    assert.ok(nextOccurrence("2026-09-20", rule) > "2026-09-20", JSON.stringify(rule));
  }
});

test("monthly keeps the same date", () => {
  assert.equal(nextOccurrence("2026-09-15", { kind: "monthly" }), "2026-10-15");
  assert.equal(nextOccurrence("2026-12-15", { kind: "monthly" }), "2027-01-15");
});

test("monthly clamps into a short month instead of overflowing", () => {
  // The 31st of January is the 28th of February, not the 3rd of March.
  assert.equal(nextOccurrence("2026-01-31", { kind: "monthly" }), "2026-02-28");
  assert.equal(nextOccurrence("2028-01-31", { kind: "monthly" }), "2028-02-29");
  assert.equal(nextOccurrence("2026-03-31", { kind: "monthly" }), "2026-04-30");
});

test("a malformed date yields nothing rather than a wrong date", () => {
  assert.equal(nextOccurrence("", { kind: "daily" }), "");
  assert.equal(nextOccurrence("2026-02-31", { kind: "daily" }), "");
  assert.equal(nextOccurrence("not a date", { kind: "daily" }), "");
});

test("weekly with no days chosen is not a repeat", () => {
  // It would never come back, so the task would silently vanish.
  assert.deepEqual(normalizeRepeat(weekly()), { kind: "none", days: [] });
  assert.equal(isRepeating(weekly()), false);
  assert.equal(nextOccurrence("2026-09-20", weekly()), "");
});

test("weekday input is cleaned up rather than trusted", () => {
  assert.deepEqual(normalizeRepeat({ kind: "weekly", days: [5, 1, 1, 9, -2, 3] }), {
    kind: "weekly",
    days: [1, 3, 5],
  });
  assert.deepEqual(normalizeRepeat({ kind: "nonsense" }), { kind: "none", days: [] });
});

test("rules read as a person would say them", () => {
  assert.equal(describeRepeat({ kind: "none" }), "");
  assert.equal(describeRepeat({ kind: "daily" }), "Daily");
  assert.equal(describeRepeat(weekly(1, 2, 3, 4, 5)), "Weekdays");
  assert.equal(describeRepeat(weekly(0, 6)), "Weekends");
  assert.equal(describeRepeat(weekly(1, 3, 5)), "Mon Wed Fri");
  assert.equal(describeRepeat(weekly(0, 1, 2, 3, 4, 5, 6)), "Daily");
});
