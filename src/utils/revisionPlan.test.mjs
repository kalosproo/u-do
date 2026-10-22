import { test } from "node:test";
import assert from "node:assert/strict";

import { parseChapters, revisionPlan } from "./revisionPlan.js";

test("chapters: one per line, bullets and numbers stripped, duplicates dropped", () => {
  assert.deepEqual(parseChapters("1. Optics\n- Waves\n\n  waves \n• Thermodynamics"), ["Optics", "Waves", "Thermodynamics"]);
  assert.deepEqual(parseChapters(""), []);
});

test("fewer chapters than days: spread out, last day kept for full revision", () => {
  const { items, error } = revisionPlan({ chapters: ["A", "B", "C"], startKey: "2026-10-22", examKey: "2026-10-29", examTitle: "Physics" });
  assert.equal(error, "");
  assert.deepEqual(items.map((i) => i.date), ["2026-10-22", "2026-10-24", "2026-10-26", "2026-10-28"]);
  assert.equal(items[0].title, "Revise A · Physics");
  assert.equal(items[3].title, "Full revision · Physics");
});

test("more chapters than days: doubled up evenly, every day used", () => {
  const { items } = revisionPlan({ chapters: ["1", "2", "3", "4", "5"], startKey: "2026-10-22", examKey: "2026-10-25", reviewDay: false });
  const perDay = {};
  items.forEach((i) => { perDay[i.date] = (perDay[i.date] || 0) + 1; });
  assert.deepEqual(Object.keys(perDay), ["2026-10-22", "2026-10-23", "2026-10-24"]);
  assert.ok(Math.max(...Object.values(perDay)) - Math.min(...Object.values(perDay)) <= 1);
});

test("too soon, or nothing to plan", () => {
  assert.match(revisionPlan({ chapters: ["A"], startKey: "2026-10-22", examKey: "2026-10-22" }).error, /too soon/);
  assert.match(revisionPlan({ chapters: [], startKey: "2026-10-22", examKey: "2026-10-30" }).error, /chapter/);
  // One day only: no room for a separate review day.
  const one = revisionPlan({ chapters: ["A", "B"], startKey: "2026-10-22", examKey: "2026-10-23" });
  assert.deepEqual(one.items.map((i) => i.date), ["2026-10-22", "2026-10-22"]);
});

test("month boundaries", () => {
  const { items } = revisionPlan({ chapters: ["A"], startKey: "2026-10-31", examKey: "2026-11-02" });
  assert.deepEqual(items.map((i) => i.date), ["2026-10-31", "2026-11-01"]);
});
