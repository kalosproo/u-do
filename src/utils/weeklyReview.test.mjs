// Weekly review tests.   node --test src/utils/weeklyReview.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { reviewWeekFor, weeklyReview } from "./weeklyReview.js";

test("shown on Sunday for this week and Monday for last week, not other days", () => {
  assert.deepEqual(reviewWeekFor(new Date(2026, 9, 18)), { start: "2026-10-12", end: "2026-10-18", isPast: false });
  assert.deepEqual(reviewWeekFor(new Date(2026, 9, 19)), { start: "2026-10-12", end: "2026-10-18", isPast: true });
  assert.equal(reviewWeekFor(new Date(2026, 9, 21)), null);
});

const week = { start: "2026-10-12", end: "2026-10-18" };

test("counts only what happened that week", () => {
  const r = weeklyReview({
    tasks: [
      { status: "done", completedAt: new Date(2026, 9, 14, 10) },
      { status: "done", completedAt: new Date(2026, 9, 5, 10) },
      { status: "done" },
      { status: "todo", completedAt: null },
    ],
    habits: [
      { title: "Read", logs: { "2026-10-12": true, "2026-10-13": true, "2026-10-01": true } },
      { title: "Gym", logs: { "2026-10-15": true, "2026-10-16": false } },
    ],
    plans: [{ date: "2026-10-13", completed: true }, { date: "2026-10-14" }, { date: "2026-10-30", completed: true }],
    expenses: [
      { date: "2026-10-14", type: "income", amountMinor: 50000 },
      { date: "2026-10-15", type: "expense", amountMinor: 12000 },
      { date: "2026-09-15", type: "expense", amountMinor: 99900 },
    ],
  }, week);
  assert.equal(r.tasksDone, 1);
  assert.equal(r.checkIns, 3);
  assert.deepEqual(r.topHabit, { title: "Read", count: 2 });
  assert.equal(r.plansDone, 1);
  assert.equal(r.plansTotal, 2);
  assert.equal(r.moneyIn, 50000);
  assert.equal(r.moneyOut, 12000);
  assert.equal(r.empty, false);
});

test("a quiet week says so rather than showing zeros as achievements", () => {
  assert.equal(weeklyReview({}, week).empty, true);
});
