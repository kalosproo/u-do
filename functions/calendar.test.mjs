import test from "node:test";
import assert from "node:assert/strict";

import { buildCalendar, escapeText, feedSignature, foldLine, verifyFeed } from "./src/calendar/calendarCore.js";

const now = new Date("2026-10-22T04:00:00Z");

test("signatures: a reset (new version) kills the old link", () => {
  const s1 = feedSignature("u1", 1, "secret");
  assert.equal(verifyFeed("u1", 1, s1, "secret"), true);
  assert.equal(verifyFeed("u1", 2, s1, "secret"), false);
  assert.equal(verifyFeed("u2", 1, s1, "secret"), false);
  assert.equal(verifyFeed("u1", 1, "forged", "secret"), false);
  assert.equal(verifyFeed("u1", 1, s1, ""), false);
});

test("text is escaped and long lines fold at 75 octets", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const folded = foldLine(`SUMMARY:${"x".repeat(200)}`);
  for (const line of folded.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), `SUMMARY:${"x".repeat(200)}`);
  const emoji = foldLine(`SUMMARY:${"✓".repeat(60)}`);
  for (const line of emoji.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
});

test("exams are all-day events, plans keep their time", () => {
  const ics = buildCalendar({
    exams: [{ id: "e1", title: "Physics final", date: "2026-11-12", subject: "Physics" }, { id: "bad", title: "No date", date: "soon" }],
    plans: [{ id: "p1", title: "Gym", date: "2026-10-22", time: "18:30" }, { id: "p2", title: "Read", date: "2026-10-23", completed: true }, { id: "p3", title: "Late", date: "2026-10-23", time: "23:45" }],
    now,
  });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /UID:exam-e1@u-do\r\nDTSTAMP:20261022T040000Z\r\nDTSTART;VALUE=DATE:20261112\r\nDTEND;VALUE=DATE:20261113\r\nSUMMARY:Exam: Physics final\r\nDESCRIPTION:Subject: Physics/);
  assert.match(ics, /UID:plan-p1@u-do\r\nDTSTAMP:\S+\r\nDTSTART:20261022T183000\r\nDTEND:20261022T190000/);
  assert.match(ics, /SUMMARY:✓ Read/);
  assert.match(ics, /UID:plan-p3@u-do\r\nDTSTAMP:\S+\r\nDTSTART:20261023T234500\r\nDTEND:20261024T000000/);
  assert.ok(!ics.includes("No date"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
});

test("month end rolls over correctly", () => {
  const ics = buildCalendar({ exams: [{ id: "e", title: "X", date: "2026-12-31" }], now });
  assert.match(ics, /DTEND;VALUE=DATE:20270101/);
});
