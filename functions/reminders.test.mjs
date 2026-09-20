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
const titles = (offset, w = work, t = all, current = 0) =>
  composeMessages(w, t, offset, current).map((message) => message.title);

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


// --------------------------------------------------------- tasks with a time

const timed = (dueTime, extra = {}) => ({
  tasks: [{ title: "DBMS lab", dueDate: "2026-09-18", dueTime, leadMinutes: 30, ...extra }],
  habits: [],
  plans: [],
  dayKey: "2026-09-18",
});
const tasksOnly = { tasks: true, habits: false, planner: false };

test("a task due at 2pm is silent all morning", () => {
  for (const clock of ["08:00", "09:30", "12:00", "13:00"]) {
    assert.deepEqual(
      composeMessages(timed("14:00"), tasksOnly, 0, at(clock)),
      [],
      `should be silent at ${clock}`,
    );
  }
});

test("the heads-up fires once, at the lead time", () => {
  const firing = [];
  for (let minute = 0; minute < 1440; minute += 30) {
    if (titles(0, timed("14:00"), tasksOnly, minute).includes("Coming up")) firing.push(minute);
  }
  assert.deepEqual(firing, [at("13:30")], "exactly one heads-up, 30 minutes before");
});

test("a custom lead time is honoured", () => {
  const twoHours = timed("14:00", { leadMinutes: 120 });
  assert.ok(titles(0, twoHours, tasksOnly, at("12:00")).includes("Coming up"));
  assert.ok(!titles(0, twoHours, tasksOnly, at("13:30")).includes("Coming up"));

  const [message] = composeMessages(twoHours, tasksOnly, 0, at("12:00"));
  assert.match(message.body, /in 2 hours/);
});

test("once its time arrives, a timed task nags every run", () => {
  const firing = [];
  for (let minute = at("14:00"); minute <= at("21:00"); minute += 30) {
    if (titles(0, timed("14:00"), tasksOnly, minute).includes("Due now")) firing.push(minute);
  }
  assert.equal(firing.length, 15, "14:00 to 21:00 inclusive, every 30 minutes");
  assert.equal(firing[0], at("14:00"), "starts exactly at its time, not before");
});

test("an untimed task still reads as due today, not due now", () => {
  const untimed = {
    tasks: [{ title: "Read chapter 4", dueDate: "2026-09-18" }],
    habits: [],
    plans: [],
    dayKey: "2026-09-18",
  };
  assert.deepEqual(titles(0, untimed, tasksOnly, at("08:00")), ["Due today"]);
});

test("a task overdue by a day nags regardless of its time", () => {
  const yesterday = {
    tasks: [{ title: "Pay fees", dueDate: "2026-09-17", dueTime: "23:00" }],
    habits: [],
    plans: [],
    dayKey: "2026-09-18",
  };
  // 08:00 is long before 23:00, but the day has already passed.
  assert.deepEqual(titles(0, yesterday, tasksOnly, at("08:00")), ["Overdue"]);
});

test("a heads-up whose lead falls before midnight is skipped, not fired at 00:00", () => {
  const earlyTask = timed("00:15", { leadMinutes: 30 });
  const firing = [];
  for (let minute = 0; minute < 1440; minute += 30) {
    if (titles(0, earlyTask, tasksOnly, minute).includes("Coming up")) firing.push(minute);
  }
  assert.deepEqual(firing, [], "no heads-up rather than a wrong one");
});

test("a heads-up and a nag can both land, and do not share a tag", () => {
  const two = {
    tasks: [
      { title: "Lab", dueDate: "2026-09-18", dueTime: "14:00", leadMinutes: 30 },
      { title: "Essay", dueDate: "2026-09-18", dueTime: "09:00", leadMinutes: 30 },
    ],
    habits: [],
    plans: [],
    dayKey: "2026-09-18",
  };
  const messages = composeMessages(two, tasksOnly, 0, at("13:30"));
  assert.equal(messages.length, 2, "one heads-up for the lab, one nag for the essay");
  assert.equal(new Set(messages.map((m) => m.tag)).size, 2);
});
