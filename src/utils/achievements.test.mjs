// Achievements.   node --test src/utils/achievements.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { BADGES, earnedBadges, newlyEarned, progressToward } from "./achievements.js";

test("badges come from the numbers", () => {
  assert.deepEqual(earnedBadges({}), []);
  const ids = earnedBadges({ focusSessions: 3, focusHours: 12, habitStreak: 8, tasksDone: 10 });
  assert.deepEqual(ids, ["focus-first", "focus-10h", "habit-7", "tasks-10"]);
});

test("only badges not already kept are new", () => {
  assert.deepEqual(newlyEarned({ focusSessions: 1, tasksDone: 10 }, { "focus-first": "2026-10-01" }), ["tasks-10"]);
});

test("progress is capped between 0 and 1", () => {
  const badge = BADGES.find((b) => b.id === "focus-10h");
  assert.equal(progressToward(badge, { focusHours: 5 }), 0.5);
  assert.equal(progressToward(badge, { focusHours: 50 }), 1);
  assert.equal(progressToward(badge, {}), 0);
});

test("every badge has a unique id", () => {
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
});
