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
