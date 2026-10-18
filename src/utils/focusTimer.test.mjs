// Focus timer tests.   node --test src/utils/focusTimer.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { addToLog, breakMinutesFor, formatClock, formatMinutes, lastDays, progressOf, pruneLog, remainingOf } from "./focusTimer.js";

test("the clock reads like a clock and never shows 00:00 early", () => {
  assert.equal(formatClock(25 * 60_000), "25:00");
  assert.equal(formatClock(1_499_000), "24:59");
  assert.equal(formatClock(400), "00:01");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(90 * 60_000), "1:30:00");
  assert.equal(formatClock(-5), "00:00");
});

test("breaks scale with the session", () => {
  assert.equal(breakMinutesFor(25), 5);
  assert.equal(breakMinutesFor(50), 10);
  assert.equal(breakMinutesFor(90), 15);
});

test("time left comes from the end time, so a sleeping tab stays right", () => {
  const session = { minutes: 25, endsAt: 1_000_000 + 25 * 60_000, paused: false };
  assert.equal(remainingOf(session, 1_000_000), 25 * 60_000);
  assert.equal(remainingOf(session, 1_000_000 + 30 * 60_000), 0);
  assert.equal(progressOf(session, 1_000_000 + 12.5 * 60_000), 0.5);
});

test("paused time stands still", () => {
  const paused = { minutes: 25, paused: true, remainingMs: 600_000 };
  assert.equal(remainingOf(paused, 0), 600_000);
  assert.equal(remainingOf(paused, 9e12), 600_000);
});

test("the daily log adds up and keeps seven days in order", () => {
  let log = addToLog({}, 25, new Date(2026, 9, 18, 9));
  log = addToLog(log, 50, new Date(2026, 9, 18, 15));
  log = addToLog(log, 25, new Date(2026, 9, 16, 15));
  assert.deepEqual(log["2026-10-18"], { minutes: 75, sessions: 2 });
  const days = lastDays(log, 7, new Date(2026, 9, 18, 20));
  assert.equal(days.length, 7);
  assert.equal(days[6].minutes, 75);
  assert.equal(days[4].minutes, 25);
  assert.equal(days[0].key, "2026-10-12");
  assert.equal(formatMinutes(100), "1h 40m");
  assert.equal(formatMinutes(25), "25m");
});

test("old days are pruned", () => {
  const log = { "2026-01-01": { minutes: 25, sessions: 1 }, "2026-10-17": { minutes: 25, sessions: 1 } };
  assert.deepEqual(Object.keys(pruneLog(log, new Date(2026, 9, 18))), ["2026-10-17"]);
});
