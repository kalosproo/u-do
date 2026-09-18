// Cadence tests for the scheduled reminders.
//
//   node --test functions/reminders.test.mjs
//
// The rhythms are the part that breaks silently: "every 30 minutes until done"
// quietly becoming "every run forever", or an hourly nudge firing twice an
// hour, is invisible until someone's phone is buzzing at them. These run
// against the clock arithmetic directly — no emulator, no network, no waiting
// half an hour to see what happens.
import test from "node:test";
import assert from "node:assert/strict";

import {
  composeMessages,
  minutesOf,
  windowOffset,
} from "./src/notifications/cadence.js";

const at = (hhmm) => minutesOf(hhmm, 0);
const RUN = 30;

/** Every scheduler run in a day, as the every-30-minutes schedule produces. */
const runsAcross = (start, end) => {
  const offsets = [];
  for (let minute = 0; minute < 1440; minute += RUN) {
    const offset = windowOffset(minute, at(start), at(end));
    if (offset !== null) offsets.push(offset);
  }
  return offsets;
};

test("the window is closed outside its hours", () => {
  assert.equal(windowOffset(at("07:30"), at("08:00"), at("21:00")), null);
  assert.equal(windowOffset(at("21:30"), at("08:00"), at("21:00")), null);
  assert.equal(windowOffset(at("03:00"), at("08:00"), at("21:00")), null);
});

test("the window is open at its edges and inside", () => {
  assert.equal(windowOffset(at("08:00"), at("08:00"), at("21:00")), 0);
  assert.equal(windowOffset(at("12:00"), at("08:00"), at("21:00")), 240);
  assert.equal(windowOffset(at("21:00"), at("08:00"), at("21:00")), 780);
});

test("a window crossing midnight stays open across it", () => {
  assert.equal(windowOffset(at("23:00"), at("22:00"), at("02:00")), 60);
  assert.equal(windowOffset(at("01:00"), at("22:00"), at("02:00")), 180);
  assert.equal(windowOffset(at("12:00"), at("22:00"), at("02:00")), null);
});

const work = {
  tasks: [{ title: "Submit DBMS assignment", dueDate: "2026-09-18" }],
  habits: [{ title: "Read" }],
  plans: [{ title: "Gym" }],
  dayKey: "2026-09-18",
};
const all = { tasks: true, habits: true, planner: true };
const titles = (offset, w = work, t = all) =>
  composeMessages(w, t, offset).map((message) => message.title);

test("tasks repeat on every run inside the window", () => {
  const offsets = runsAcross("08:00", "21:00");
  const firing = offsets.filter((offset) => titles(offset).includes("Due today"));
  assert.equal(firing.length, offsets.length, "tasks should fire on every run");
  assert.equal(offsets.length, 27, "08:00-21:00 is 27 runs at 30 minutes");
});

test("habits repeat hourly, not every run", () => {
  const offsets = runsAcross("08:00", "21:00");
  const firing = offsets.filter((offset) => titles(offset).includes("Streak check"));
  assert.equal(firing.length, 14, "one per hour across a 13-hour window, inclusive");
  firing.forEach((offset) => assert.equal(offset % 60, 0));
});

test("the plan is sent once, at the start", () => {
  const offsets = runsAcross("08:00", "21:00");
  const firing = offsets.filter((offset) => titles(offset).includes("Today's plan"));
  assert.deepEqual(firing, [0]);
});

test("an hourly rhythm still holds when the window starts off the hour", () => {
  // Runs land on :00 and :30, so a 08:15 start makes every offset odd.
  const offsets = runsAcross("08:15", "21:00");
  const firing = offsets.filter((offset) => titles(offset).includes("Streak check"));
  firing.forEach((offset, index) => {
    if (index > 0) assert.equal(offset - firing[index - 1], 60);
  });
  assert.ok(firing.length >= 12);
});

test("nothing outstanding sends nothing", () => {
  const empty = { tasks: [], habits: [], plans: [], dayKey: "2026-09-18" };
  assert.deepEqual(composeMessages(empty, all, 0), []);
  assert.deepEqual(composeMessages(empty, all, 60), []);
});

test("a switched-off type never fires", () => {
  const off = { tasks: false, habits: false, planner: false };
  assert.deepEqual(composeMessages(work, off, 0), []);
});

test("overdue tasks are named as overdue, not as due today", () => {
  const overdue = { ...work, tasks: [{ title: "Pay hostel wifi bill", dueDate: "2026-09-10" }] };
  const [message] = composeMessages(overdue, all, 0);
  assert.equal(message.title, "Overdue");
});

test("one item is named, several are counted", () => {
  const [single] = composeMessages(work, { tasks: true }, 0);
  assert.equal(single.body, "Submit DBMS assignment");

  const many = {
    ...work,
    tasks: [
      { title: "a", dueDate: "2026-09-18" },
      { title: "b", dueDate: "2026-09-10" },
    ],
  };
  const [plural] = composeMessages(many, { tasks: true }, 0);
  assert.equal(plural.body, "2 tasks still open, 1 overdue.");
});

test("each reminder carries its own tag, so they replace rather than stack", () => {
  const tags = composeMessages(work, all, 0).map((message) => message.tag);
  assert.deepEqual(new Set(tags).size, tags.length);
  assert.deepEqual(tags.sort(), ["udo-habits", "udo-planner", "udo-tasks"]);
});
