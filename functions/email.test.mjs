// Daily summary email.   node --test functions/email.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { composeDigest, isSendTime, minutesOfTime, unsubscribeSignature, verifyUnsubscribe } from "./src/email/emailCore.js";

const base = { name: "Haneesh Varma", dayKey: "2026-10-21", unsubscribeUrl: "https://x/unsub?u=1&s=abc" };

test("nothing due means no email at all", () => {
  assert.equal(composeDigest({ ...base }), null);
  assert.equal(composeDigest({ ...base, tasks: [{ title: "later", dueDate: "2026-10-25" }] }), null);
});

test("lists overdue, today, plans and habits, with a plain subject", () => {
  const e = composeDigest({
    ...base,
    tasks: [{ title: "Lab report", dueDate: "2026-10-20" }, { title: "Physics", dueDate: "2026-10-21", dueTime: "09:30" }],
    habits: [{ title: "Read 20 min" }],
    plans: [{ title: "Gym" }],
  });
  assert.equal(e.subject, "Today: 1 due today, 1 overdue, 1 habit to tick");
  assert.match(e.text, /Good morning, Haneesh\./);
  assert.match(e.text, /OVERDUE\n- Lab report/);
  assert.match(e.text, /- Physics · 09:30/);
  assert.match(e.html, /Read 20 min/);
  assert.match(e.text, /unsub\?u=1&s=abc/);
});

test("titles can't inject HTML", () => {
  const e = composeDigest({ ...base, habits: [{ title: "<script>alert(1)</script>" }] });
  assert.ok(!e.html.includes("<script>"));
  assert.ok(e.html.includes("&lt;script&gt;"));
});

test("long lists are cut to six with a count", () => {
  const habits = Array.from({ length: 9 }, (_, i) => ({ title: `Habit ${i}` }));
  const e = composeDigest({ ...base, habits });
  assert.match(e.text, /and 3 more/);
  assert.ok(!e.text.includes("Habit 8"));
});

test("unsubscribe links are signed per account", () => {
  const sig = unsubscribeSignature("u1", "a-long-enough-secret");
  assert.equal(verifyUnsubscribe("u1", sig, "a-long-enough-secret"), true);
  assert.equal(verifyUnsubscribe("u2", sig, "a-long-enough-secret"), false);
  assert.equal(verifyUnsubscribe("u1", "nope", "a-long-enough-secret"), false);
  assert.equal(verifyUnsubscribe("u1", sig, ""), false);
});

test("it sends in the half hour after the chosen time, across midnight too", () => {
  assert.equal(minutesOfTime("07:30"), 450);
  assert.equal(minutesOfTime("bad"), 450);
  assert.equal(isSendTime(450, 450), true);
  assert.equal(isSendTime(479, 450), true);
  assert.equal(isSendTime(480, 450), false);
  assert.equal(isSendTime(449, 450), false);
  assert.equal(isSendTime(5, minutesOfTime("23:50")), true);
});

import { composeMonthly, countMonth, previousMonth } from "./src/email/monthlyCore.js";

test("the monthly report covers last month, on the 1st only", () => {
  assert.deepEqual(previousMonth("2026-11-01"), { start: "2026-10-01", end: "2026-10-31", monthKey: "2026-10", label: "October 2026" });
  assert.equal(previousMonth("2027-01-01").start, "2026-12-01");
  assert.equal(previousMonth("2026-11-02"), null);
});

test("counts the month and writes it plainly", () => {
  const range = previousMonth("2026-11-01");
  const counts = countMonth({
    tasksDone: 7,
    habits: [{ logs: { "2026-10-02": true, "2026-09-30": true } }],
    plans: [{ date: "2026-10-03", completed: true }, { date: "2026-10-04" }],
    expenses: [{ date: "2026-10-05", type: "income", amountMinor: 500000 }, { date: "2026-10-06", amount: 249 }],
    focusDays: [{ date: "2026-10-07", minutes: 150, subjects: { Physics: 120, Maths: 30 } }],
  }, range);
  assert.equal(counts.checkIns, 1);
  assert.equal(counts.plansDone, 1);
  assert.equal(counts.moneyOut, 24900);
  assert.deepEqual(counts.topSubject, { name: "Physics", minutes: 120 });
  const email = composeMonthly({ name: "Haneesh Varma", counts, label: range.label, unsubscribeUrl: "https://x/u" });
  assert.equal(email.subject, "Your October 2026 on U.Do");
  assert.match(email.text, /Focus time: 2h 30m — mostly Physics/);
  assert.match(email.text, /₹5,000 · ₹249/);
});

test("an empty month sends nothing", () => {
  assert.equal(composeMonthly({ counts: countMonth({}, previousMonth("2026-11-01")), label: "October 2026", unsubscribeUrl: "x" }), null);
});
