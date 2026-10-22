import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanGoal, crossesGoal, goalLabel, goalProgress } from "./focusGoal.js";

test("unknown goals fall back to the default", () => {
  assert.equal(cleanGoal(120), 120);
  assert.equal(cleanGoal("60"), 60);
  assert.equal(cleanGoal(0), 0);
  assert.equal(cleanGoal(77), 120);
  assert.equal(cleanGoal(undefined), 120);
});

test("progress is clamped and zero without a goal", () => {
  assert.equal(goalProgress(60, 120), 0.5);
  assert.equal(goalProgress(300, 120), 1);
  assert.equal(goalProgress(-5, 120), 0);
  assert.equal(goalProgress(60, 0), 0);
});

test("only the stretch that reaches the goal counts as crossing it", () => {
  assert.equal(crossesGoal(100, 25, 120), true);
  assert.equal(crossesGoal(95, 25, 120), true);
  assert.equal(crossesGoal(90, 25, 120), false);
  assert.equal(crossesGoal(130, 25, 120), false);
  assert.equal(crossesGoal(100, 25, 0), false);
});

test("labels", () => {
  assert.equal(goalLabel(0), "Off");
  assert.equal(goalLabel(180), "3h");
});
