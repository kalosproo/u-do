import { test } from "node:test";
import assert from "node:assert/strict";

import { markSeen, pendingTips, placeBubble, readState, TIPS, turnOff } from "./coachMarks.js";

test("state survives bad storage", () => {
  assert.deepEqual(readState("not json"), { seen: [], off: false });
  assert.deepEqual(readState(null), { seen: [], off: false });
  assert.deepEqual(readState('{"seen":["focus",3],"off":true}'), { seen: ["focus"], off: true });
});

test("tips show once each, and Skip turns them all off", () => {
  let state = readState(null);
  assert.equal(pendingTips(state).length, TIPS.length);
  state = markSeen(state, "focus");
  state = markSeen(state, "focus");
  assert.equal(pendingTips(state).length, TIPS.length - 1);
  assert.ok(!pendingTips(state).some((t) => t.id === "focus"));
  assert.deepEqual(pendingTips(turnOff(state)), []);
});

test("bubble sits below when there's room, above when not, and stays on screen", () => {
  const viewport = { width: 390, height: 844 };
  const bubble = { width: 240, height: 80 };
  const top = placeBubble({ top: 100, bottom: 140, left: 20, width: 100 }, viewport, bubble);
  assert.equal(top.side, "below");
  assert.equal(top.left, 12); // pushed in from the left edge
  assert.equal(top.arrowX, 58); // still over the target's centre (70 - 12)
  const bottom = placeBubble({ top: 780, bottom: 830, left: 170, width: 50 }, viewport, bubble);
  assert.equal(bottom.side, "above");
  assert.equal(bottom.top, 780 - 12 - 80);
  assert.ok(bottom.left + bubble.width <= viewport.width - 12);
});
