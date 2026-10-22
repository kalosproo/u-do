import { test } from "node:test";
import assert from "node:assert/strict";

import { classesOn, currentOrNext, describeWait, validateClass } from "./timetable.js";

const classes = [
  { id: "a", subject: "Maths", day: 4, start: "09:00", end: "10:00" },
  { id: "b", subject: "Physics", day: 4, start: "14:00", end: "15:00", room: "204" },
  { id: "c", subject: "Chemistry", day: 1, start: "08:30", end: "09:30" },
];
// 2026-10-22 is a Thursday (getDay() === 4).
const at = (h, m, date = "2026-10-22") => new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

test("validation", () => {
  assert.equal(validateClass({ subject: "Maths", day: 1, start: "09:00", end: "10:00" }), "");
  assert.match(validateClass({ subject: "", day: 1, start: "09:00", end: "10:00" }), /subject/);
  assert.match(validateClass({ subject: "M", day: 7, start: "09:00", end: "10:00" }), /day/);
  assert.match(validateClass({ subject: "M", day: 1, start: "9am", end: "10:00" }), /time/);
  assert.match(validateClass({ subject: "M", day: 1, start: "10:00", end: "09:00" }), /end after/);
});

test("sorted per day", () => {
  assert.deepEqual(classesOn(classes, 4).map((c) => c.id), ["a", "b"]);
  assert.deepEqual(classesOn(classes, 0), []);
});

test("now, next today, next week", () => {
  assert.deepEqual(currentOrNext(classes, at(9, 30)), { cls: classes[0], status: "now", minutes: 30 });
  const next = currentOrNext(classes, at(12, 15));
  assert.equal(next.cls.id, "b");
  assert.equal(next.minutes, 105);
  assert.equal(describeWait(next.minutes, next.cls, at(12, 15)), "in 1h 45m");
  const later = currentOrNext(classes, at(16, 0));
  assert.equal(later.cls.id, "c"); // Monday
  assert.equal(describeWait(later.minutes, later.cls, at(16, 0)), "on Monday");
  assert.equal(currentOrNext([], at(9, 0)), null);
});

test("tomorrow and soon", () => {
  const list = [{ id: "x", subject: "Bio", day: 5, start: "08:00", end: "09:00" }];
  const next = currentOrNext(list, at(20, 0));
  assert.equal(describeWait(next.minutes, next.cls, at(20, 0)), "tomorrow");
  assert.equal(describeWait(20, list[0], at(7, 40)), "in 20 min");
});
