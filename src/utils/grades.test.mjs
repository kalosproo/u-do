import { test } from "node:test";
import assert from "node:assert/strict";

import { gradeSummary, percentOf, validateGrade } from "./grades.js";

test("validation", () => {
  assert.equal(validateGrade({ subject: "Physics", score: 42, outOf: 50 }), "");
  assert.match(validateGrade({ subject: "", score: 1, outOf: 2 }), /subject/);
  assert.match(validateGrade({ subject: "P", score: 60, outOf: 50 }), /more than/);
  assert.match(validateGrade({ subject: "P", score: 1, outOf: 0 }), /Out of/);
  assert.match(validateGrade({ subject: "P", score: "", outOf: 10 }), /./);
});

test("percent", () => {
  assert.equal(percentOf({ score: 42, outOf: 50 }), 84);
});

test("per subject: average, latest, change; subjects merged case-insensitively", () => {
  const { subjects, overall } = gradeSummary([
    { subject: "Physics", score: 40, outOf: 50, date: "2026-09-01" },
    { subject: "physics", score: 45, outOf: 50, date: "2026-10-01" },
    { subject: "Maths", score: 70, outOf: 100, date: "2026-10-02" },
  ]);
  assert.deepEqual(subjects.map((s) => s.subject), ["Maths", "Physics"]);
  const physics = subjects[1];
  assert.equal(physics.count, 2);
  assert.equal(physics.average, 85);
  assert.equal(physics.latest, 90);
  assert.equal(physics.change, 10);
  assert.equal(subjects[0].change, null);
  assert.equal(overall, 77.5);
});

test("weights tilt the average", () => {
  const { subjects } = gradeSummary([
    { subject: "Chem", score: 50, outOf: 100, weight: 20 },
    { subject: "Chem", score: 90, outOf: 100, weight: 80 },
  ]);
  assert.equal(subjects[0].average, 82);
});

test("empty", () => {
  assert.deepEqual(gradeSummary([]), { subjects: [], overall: null });
});
