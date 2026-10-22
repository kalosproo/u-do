import { test } from "node:test";
import assert from "node:assert/strict";

import { rankWeek, weekKeyOf, weekMinutes } from "./leaderboard.js";

test("weeks start on Monday", () => {
  assert.equal(weekKeyOf(new Date(2026, 9, 22)), "2026-10-19"); // Thursday
  assert.equal(weekKeyOf(new Date(2026, 9, 19)), "2026-10-19"); // Monday
  assert.equal(weekKeyOf(new Date(2026, 9, 25)), "2026-10-19"); // Sunday
  assert.equal(weekKeyOf(new Date(2026, 9, 26)), "2026-10-26");
});

test("this week's minutes ignore last week and the future", () => {
  const log = { "2026-10-18": { minutes: 500 }, "2026-10-19": { minutes: 30 }, "2026-10-22": { minutes: 45 }, "2026-10-23": { minutes: 99 } };
  assert.equal(weekMinutes(log, new Date(2026, 9, 22)), 75);
  assert.equal(weekMinutes({}, new Date(2026, 9, 22)), 0);
});

test("ranking: most first, stale weeks count zero, ties share a place", () => {
  const ranked = rankWeek(
    [
      { name: "A", week: "2026-10-19", minutes: 90 },
      { name: "B", week: "2026-10-12", minutes: 900 },
      { name: "C", week: "2026-10-19", minutes: 120 },
      { name: "D", week: "2026-10-19", minutes: 90 },
    ],
    "2026-10-19"
  );
  assert.deepEqual(ranked.map((p) => [p.name, p.minutes, p.rank]), [["C", 120, 1], ["A", 90, 2], ["D", 90, 2], ["B", 0, 4]]);
});
