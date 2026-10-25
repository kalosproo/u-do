import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BREAK_IDEAS,
  MAX_PICKS,
  breakIdea,
  cleanPicks,
  currentStep,
  dayLeft,
  dayRun,
  dueFor,
  firstSteps,
  groupTasks,
  streakWords,
  gentleDue,
  pickForMe,
  picksFor,
  planDay,
  rankTasks,
  swapNow,
  todayPlan,
  togglePick,
} from "./adhd.js";

const TODAY = "2026-10-23";
const task = (id, patch = {}) => ({ id, title: id, status: "todo", priority: "medium", dueDate: "", ...patch });

test("ranking: from earlier, then today, then priority, then date; done tasks left out", () => {
  const tasks = [
    task("later-high", { dueDate: "2026-10-30", priority: "high" }),
    task("undated"),
    task("today-low", { dueDate: TODAY, priority: "low" }),
    task("earlier", { dueDate: "2026-10-20" }),
    task("today-high", { dueDate: TODAY, priority: "high" }),
    task("finished", { status: "done", dueDate: "2026-10-01" }),
  ];
  assert.deepEqual(rankTasks(tasks, TODAY).map((t) => t.id), ["earlier", "today-high", "today-low", "later-high", "undated"]);
});

test("pick for me keeps your picks and fills the rest", () => {
  const tasks = [task("a", { dueDate: TODAY }), task("b", { dueDate: "2026-10-01" }), task("c"), task("d")];
  assert.deepEqual(pickForMe(tasks, TODAY), ["b", "a", "c"]);
  assert.deepEqual(pickForMe(tasks, TODAY, ["d"]), ["d", "b", "a"]);
  assert.equal(pickForMe(tasks, TODAY, ["a", "b", "c"]).length, MAX_PICKS);
  assert.deepEqual(pickForMe([], TODAY), []);
});

test("picks are for one day only", () => {
  assert.deepEqual(picksFor({ day: TODAY, picks: ["a"] }, TODAY), ["a"]);
  assert.deepEqual(picksFor({ day: "2026-10-22", picks: ["a"] }, TODAY), []);
  assert.deepEqual(picksFor(null, TODAY), []);
});

test("clean picks: strings, no repeats, at most three", () => {
  assert.deepEqual(cleanPicks(["a", "a", 3, "", "b", "c", "d"]), ["a", "b", "c"]);
  assert.deepEqual(cleanPicks("a"), []);
});

test("toggle adds up to three and removes", () => {
  assert.deepEqual(togglePick([], "a"), ["a"]);
  assert.deepEqual(togglePick(["a"], "a"), []);
  assert.deepEqual(togglePick(["a", "b", "c"], "d"), ["a", "b", "c"]);
});

test("today's plan: now is the first open pick, deleted tasks drop out", () => {
  const tasks = [task("a", { status: "done" }), task("b"), task("c")];
  const plan = todayPlan(tasks, ["a", "gone", "b"]);
  assert.equal(plan.done, 1);
  assert.equal(plan.now.id, "b");
  assert.deepEqual(plan.next.map((t) => t.id), []);
  const full = todayPlan(tasks, ["b", "c", "a"]);
  assert.equal(full.now.id, "b");
  assert.deepEqual(full.next.map((t) => t.id), ["c"]);
  assert.equal(todayPlan(tasks, ["a"]).now, null);
});

test("swap sends the current task to the back", () => {
  const tasks = [task("a"), task("b"), task("c")];
  assert.deepEqual(swapNow(["a", "b", "c"], tasks), ["b", "c", "a"]);
  assert.deepEqual(swapNow(["a"], tasks), ["a"]);
  // A finished task ahead of it stays where it is.
  const mixed = [task("a", { status: "done" }), task("b"), task("c")];
  assert.deepEqual(swapNow(["a", "b", "c"], mixed), ["a", "c", "b"]);
});

test("current step is the first unticked one", () => {
  const steps = [{ id: "1", title: "Open the book", done: true }, { id: "2", title: "Read page 1", done: false }];
  assert.deepEqual(currentStep({ subtasks: steps }), { step: steps[1], number: 2, total: 2 });
  assert.equal(currentStep({ subtasks: [{ ...steps[0] }] }), null);
  assert.equal(currentStep({}), null);
});

test("break ideas cycle and never come back empty", () => {
  assert.equal(breakIdea(0), BREAK_IDEAS[0]);
  assert.equal(breakIdea(BREAK_IDEAS.length + 1), BREAK_IDEAS[1]);
  assert.ok(breakIdea(-5));
  assert.ok(breakIdea("nonsense"));
});

test("gentle due labels never say overdue", () => {
  assert.equal(gentleDue("2026-10-01", TODAY), "From earlier");
  assert.equal(gentleDue(TODAY, TODAY), "Today");
  assert.equal(gentleDue("2026-11-01", TODAY), "");
  assert.equal(gentleDue("", TODAY), "");
});

test("day left: hours to the half, kind at either end", () => {
  const at = (h, m = 0) => new Date(2026, 9, 23, h, m);
  assert.equal(dayLeft(at(19, 40)).label, "About 3½ h left today");
  assert.equal(dayLeft(at(20, 0)).label, "About 3 h left today");
  assert.equal(dayLeft(at(22, 20)).label, "About 40 min left today");
  assert.equal(dayLeft(at(23, 30)).label, "Late. Rest counts too.");
  assert.equal(dayLeft(at(5, 0)).label, "Early. The day hasn't started yet.");
  assert.equal(dayLeft(at(0, 40)).label, "Late. Rest counts too.");
  assert.equal(dayLeft(at(7, 0)).progress, 0);
  assert.equal(dayLeft(at(15, 0)).progress, 0.5);
  assert.equal(dayLeft(at(23, 59)).progress, 1);
});

test("picks belong to a day that turns over at 5am, not midnight", () => {
  assert.equal(planDay(new Date(2026, 9, 24, 0, 40)), "2026-10-23");
  assert.equal(planDay(new Date(2026, 9, 24, 4, 59)), "2026-10-23");
  assert.equal(planDay(new Date(2026, 9, 24, 5, 0)), "2026-10-24");
  assert.equal(planDay(new Date(2026, 9, 24, 23, 59)), "2026-10-24");
  // Half past midnight on the 1st is still the last night of the month before.
  assert.equal(planDay(new Date(2026, 10, 1, 0, 30)), "2026-10-31");
  assert.equal(planDay(new Date(2027, 0, 1, 2, 0)), "2026-12-31");
});

test("when: today, tomorrow (across a month end) or no date", () => {
  const at = new Date(2026, 9, 31, 22, 0);
  assert.equal(dueFor("today", at), "2026-10-31");
  assert.equal(dueFor("tomorrow", at), "2026-11-01");
  assert.equal(dueFor("someday", at), "");
});

test("tasks group into today, coming up, someday and done", () => {
  const tasks = [
    task("late", { dueDate: "2026-10-20" }),
    task("now", { dueDate: TODAY, priority: "high" }),
    task("now-low", { dueDate: TODAY, priority: "low" }),
    task("later", { dueDate: "2026-11-02" }),
    task("whenever"),
    task("old-done", { status: "done", completedAt: { seconds: 100 } }),
    task("new-done", { status: "done", completedAt: "2026-10-23T09:00:00Z" }),
  ];
  const groups = groupTasks(tasks, TODAY);
  assert.deepEqual(groups.today.map((t) => t.id), ["late", "now", "now-low"]);
  assert.deepEqual(groups.soon.map((t) => t.id), ["later"]);
  assert.deepEqual(groups.someday.map((t) => t.id), ["whenever"]);
  assert.deepEqual(groups.done.map((t) => t.id), ["new-done", "old-done"]);
});

test("streak words only ever say something good", () => {
  assert.equal(streakWords(0), "");
  assert.equal(streakWords(1), "");
  assert.equal(streakWords(4), "4 days in a row");
  assert.equal(streakWords(3, "weekly"), "3 weeks in a row");
});

test("first steps fit what the task is about, and there are always three", () => {
  assert.equal(firstSteps("Write the history essay intro")[0], "Open a blank page and type the title");
  assert.equal(firstSteps("Maths worksheet, questions 1-10")[1], "Do only the first question");
  // Study wins over reading when a task is both.
  assert.equal(firstSteps("Revise organic chemistry chapter 12")[0], "Get your notes and a pen out");
  assert.equal(firstSteps("Reply to the club EMAIL")[1], "Write just the first line");
  assert.equal(firstSteps("Call grandma")[2], "Press call");
  assert.equal(firstSteps("Book a dentist appointment")[0], "Find the website or the number");
  assert.equal(firstSteps("Return library book")[0], "Put it by the door now");
  assert.equal(firstSteps("Read chapter 4 of the novel")[1], "Read one page");
  assert.equal(firstSteps("Renew bus pass")[0], "Open the website or app");
  // "already" isn't "read", "test" inside a word isn't a test.
  assert.equal(firstSteps("Already sorted, contest prize")[0], "Get what you need in front of you");
  for (const title of ["", "Fix bike light", "Sort photos", undefined]) assert.equal(firstSteps(title).length, 3);
});

test("a run of days counts tasks, habits and focus, and survives a quiet morning", () => {
  const at = new Date(2026, 9, 25, 9, 0);
  const done = (day) => ({ status: "done", completedAt: new Date(2026, 9, day, 18, 0).toISOString() });
  // Done something on the 22nd (a task), 23rd (a habit) and 24th (focus): three in a row, nothing yet today.
  const run = dayRun({ tasks: [done(22)], habits: [{ logs: { "2026-10-23": true } }], focusLog: { "2026-10-24": { minutes: 12 } } }, at);
  assert.deepEqual(run, { days: 3, today: false });
  // Something today makes it four.
  assert.deepEqual(dayRun({ tasks: [done(22), done(25)], habits: [{ logs: { "2026-10-23": true } }], focusLog: { "2026-10-24": { minutes: 12 } } }, at), { days: 4, today: true });
  // A gap starts it again; open tasks, unticked logs and no focus don't count.
  assert.deepEqual(dayRun({ tasks: [done(21), { status: "todo", completedAt: null }], habits: [{ logs: { "2026-10-24": false } }], focusLog: { "2026-10-24": { minutes: 0 } } }, at), { days: 0, today: false });
  assert.deepEqual(dayRun({}, at), { days: 0, today: false });
});
