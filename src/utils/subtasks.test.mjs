import { test } from "node:test";
import assert from "node:assert/strict";

import { addSubtask, cleanSubtasks, MAX_SUBTASKS, removeSubtask, resetSubtasks, subtaskProgress, toggleSubtask } from "./subtasks.js";

test("clean drops blanks, trims, caps count and length", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, title: `Step ${i}` }));
  assert.equal(cleanSubtasks(many).length, MAX_SUBTASKS);
  assert.deepEqual(cleanSubtasks([{ id: "a", title: "  Read  " }, { id: "b", title: "  " }, null]), [{ id: "a", title: "Read", done: false }]);
  assert.equal(cleanSubtasks([{ title: "x".repeat(300) }])[0].title.length, 120);
  assert.deepEqual(cleanSubtasks("nope"), []);
});

test("add, toggle, remove, progress", () => {
  let list = addSubtask([], "Outline");
  list = addSubtask(list, "Draft");
  list = addSubtask(list, "   ");
  assert.equal(list.length, 2);
  list = toggleSubtask(list, list[0].id);
  assert.deepEqual(subtaskProgress(list), { done: 1, total: 2 });
  list = removeSubtask(list, list[1].id);
  assert.deepEqual(subtaskProgress(list), { done: 1, total: 1 });
});

test("a repeat starts its checklist fresh", () => {
  assert.deepEqual(resetSubtasks([{ id: "a", title: "A", done: true }]), [{ id: "a", title: "A", done: false }]);
});
