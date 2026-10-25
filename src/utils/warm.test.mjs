import { test } from "node:test";
import assert from "node:assert/strict";

import { keepWarm, patchWarm, readWarm } from "./warm.js";

test("a screen's last view is kept per key and read back as it was", () => {
  keepWarm("u1:tasks", [{ id: "a" }]);
  assert.deepEqual(readWarm("u1:tasks"), [{ id: "a" }]);
  // Another account's key is a different copy entirely.
  assert.equal(readWarm("u2:tasks"), undefined);
});

test("nothing kept for an empty key or an empty value", () => {
  keepWarm("", [1]);
  keepWarm("u1:empty", null);
  keepWarm("u1:undef", undefined);
  assert.equal(readWarm(""), undefined);
  assert.equal(readWarm("u1:empty"), undefined);
  assert.equal(readWarm("u1:undef"), undefined);
});

test("a change made elsewhere updates what's kept, and never invents a copy", () => {
  keepWarm("u3:tasks", [{ id: "a", status: "todo" }, { id: "b", status: "todo" }]);
  patchWarm("u3:tasks", (list) => list.map((task) => (task.id === "b" ? { ...task, status: "done" } : task)));
  assert.deepEqual(readWarm("u3:tasks"), [{ id: "a", status: "todo" }, { id: "b", status: "done" }]);
  patchWarm("u4:tasks", () => [{ id: "x" }]);
  assert.equal(readWarm("u4:tasks"), undefined);
});
