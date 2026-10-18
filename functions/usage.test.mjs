// Usage-tracking tests.
//
//   node --test functions/usage.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { COUNTER_FOR, eventTypeFor, monthKeyFor, monthRange } from "./src/usage/counters.js";

test("months are India time, not UTC", () => {
  // 20:00 UTC on 31 Oct is 01:30 on 1 Nov in India.
  assert.equal(monthKeyFor(new Date("2026-10-31T20:00:00Z")), "2026-11");
  assert.equal(monthKeyFor(new Date("2026-10-31T18:00:00Z")), "2026-10");
});

test("a month is a string range that brackets every day key in it", () => {
  const { from, to } = monthRange("2026-02");
  for (const day of ["2026-02-01", "2026-02-15", "2026-02-28"]) {
    assert.ok(day >= from && day <= to, day);
  }
  for (const day of ["2026-01-31", "2026-03-01"]) {
    assert.ok(!(day >= from && day <= to), day);
  }
});

test("every workspace collection feeds exactly one counter", () => {
  assert.deepEqual(Object.keys(COUNTER_FOR).sort(), ["expenses", "habits", "planner", "tasks"]);
  assert.equal(COUNTER_FOR.expenses.monthly, true);
  assert.equal(COUNTER_FOR.tasks.monthly, false);
});

test("creates are events, edits mostly are not", () => {
  assert.equal(eventTypeFor("expenses", null, { a: 1 }), "transaction_added");
  assert.equal(eventTypeFor("habits", null, { a: 1 }), "habit_created");
  assert.equal(eventTypeFor("expenses", { a: 1 }, { a: 2 }), null);
  assert.equal(eventTypeFor("tasks", { a: 1 }, null), null, "a delete is not an event");
  assert.equal(eventTypeFor("secrets", null, { a: 1 }), null);
});

test("completing a task is an event exactly once", () => {
  assert.equal(eventTypeFor("tasks", { status: "todo" }, { status: "done", completed: true }), "task_completed");
  assert.equal(eventTypeFor("tasks", { completed: true }, { completed: true, title: "x" }), null);
  assert.equal(eventTypeFor("tasks", { completed: true }, { completed: false }), null);
});

test("an event never carries content", () => {
  // eventTypeFor returns a bare type; the writer stores only type, uid and time.
  const type = eventTypeFor("expenses", null, { title: "Rent", amountMinor: 135000 });
  assert.equal(typeof type, "string");
  assert.ok(!type.includes("Rent") && !type.includes("1350"));
});
