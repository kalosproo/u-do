// Focus page numbers.   node --test src/utils/focusStats.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { focusStats } from "./focusStats.js";

const today = new Date(2026, 9, 21, 15); // Wednesday
const log = {
  "2026-10-21": { minutes: 50, sessions: 2, subjects: { Physics: 50 } },
  "2026-10-20": { minutes: 25, sessions: 1, subjects: { Maths: 25 } },
  "2026-10-19": { minutes: 90, sessions: 1, subjects: { Physics: 90 } },
  "2026-10-17": { minutes: 25, sessions: 1 },
  "2026-09-30": { minutes: 25, sessions: 1, subjects: { Old: 25 } },
};

test("today, this week (from Monday) and this month", () => {
  const s = focusStats(log, today);
  assert.equal(s.today, 50);
  assert.equal(s.week, 165);
  assert.equal(s.month, 190);
  assert.equal(s.sessions, 6);
  assert.deepEqual(s.best, { key: "2026-10-19", minutes: 90 });
});

test("the streak counts consecutive days back from today", () => {
  assert.equal(focusStats(log, today).streak, 3);
});

test("nothing yet today doesn't break yesterday's streak", () => {
  assert.equal(focusStats(log, new Date(2026, 9, 22, 9)).streak, 3);
  assert.equal(focusStats(log, new Date(2026, 9, 23, 9)).streak, 0);
});

test("subjects add up over 30 days, biggest first", () => {
  const s = focusStats(log, today);
  assert.deepEqual(s.subjects.slice(0, 2), [{ name: "Physics", minutes: 140 }, { name: "Maths", minutes: 25 }]);
  assert.ok(s.subjects.some((x) => x.name === "Old"));
});

test("fourteen days for the chart, oldest first, ending today", () => {
  const s = focusStats(log, today);
  assert.equal(s.last14.length, 14);
  assert.equal(s.last14[13].key, "2026-10-21");
  assert.equal(s.last14[12].minutes, 25);
});

test("an empty log is all zeros", () => {
  const s = focusStats({}, today);
  assert.equal(s.today + s.week + s.month + s.streak, 0);
  assert.equal(s.best, null);
});
