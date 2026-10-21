// Monthly report.   node --test src/utils/monthlyReport.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { monthlyReport, reportMonthFor } from "./monthlyReport.js";

test("shown on the 1st to the 3rd, for last month", () => {
  const m = reportMonthFor(new Date(2026, 10, 2));
  assert.equal(m.start, "2026-10-01");
  assert.equal(m.end, "2026-10-31");
  assert.equal(reportMonthFor(new Date(2026, 10, 4)), null);
  assert.equal(reportMonthFor(new Date(2027, 0, 1)).start, "2026-12-01");
});

test("counts the month and compares focus with the month before", () => {
  const month = reportMonthFor(new Date(2026, 10, 1));
  const r = monthlyReport(
    {
      tasks: [{ status: "done", completedAt: new Date(2026, 9, 5) }, { status: "done", completedAt: new Date(2026, 8, 30) }],
      habits: [{ title: "Read", logs: { "2026-10-01": true, "2026-10-02": true } }],
      expenses: [{ date: "2026-10-10", type: "income", amountMinor: 100000 }],
    },
    month,
    {
      "2026-10-03": { minutes: 120, sessions: 3, subjects: { Physics: 90, Maths: 30 } },
      "2026-10-20": { minutes: 60, sessions: 1, subjects: { Physics: 60 } },
      "2026-09-15": { minutes: 120, sessions: 2 },
    }
  );
  assert.equal(r.tasksDone, 1);
  assert.equal(r.checkIns, 2);
  assert.equal(r.focusMinutes, 180);
  assert.equal(r.focusSessions, 4);
  assert.deepEqual(r.topSubject, { name: "Physics", minutes: 150 });
  assert.equal(r.focusChange, 50);
  assert.equal(r.empty, false);
});

test("a month with nothing is empty, and no comparison without a previous month", () => {
  const r = monthlyReport({}, reportMonthFor(new Date(2026, 10, 1)), {});
  assert.equal(r.empty, true);
  assert.equal(r.focusChange, null);
});
