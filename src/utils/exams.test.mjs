// Exam countdowns.   node --test src/utils/exams.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { countdownLabel, daysUntil, minutesStudied, upcomingExams } from "./exams.js";

const today = new Date(2026, 9, 21, 23, 30);

test("days count whole calendar days, late at night too", () => {
  assert.equal(daysUntil("2026-10-21", today), 0);
  assert.equal(daysUntil("2026-10-22", today), 1);
  assert.equal(daysUntil("2026-11-02", today), 12);
  assert.equal(daysUntil("2026-10-20", today), -1);
});

test("only upcoming exams, soonest first", () => {
  const list = upcomingExams([{ title: "B", date: "2026-11-02" }, { title: "Old", date: "2026-10-01" }, { title: "A", date: "2026-10-21" }], today);
  assert.deepEqual(list.map((e) => e.title), ["A", "B"]);
});

test("focus time counts toward the subject, ignoring case", () => {
  const log = { "2026-10-20": { subjects: { Physics: 50, maths: 25 } }, "2026-10-21": { subjects: { "physics ": 25 } } };
  assert.equal(minutesStudied({ title: "Physics final", subject: "PHYSICS" }, log), 75);
  assert.equal(minutesStudied({ title: "Maths" }, log), 25);
  assert.equal(minutesStudied({ title: "Chemistry" }, log), 0);
});

test("labels read naturally", () => {
  assert.equal(countdownLabel(0), "Today");
  assert.equal(countdownLabel(1), "Tomorrow");
  assert.equal(countdownLabel(12), "in 12 days");
});
