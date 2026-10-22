import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The calendar feed: a private iCalendar (.ics) URL that Google Calendar,
 * Apple Calendar and Outlook subscribe to, carrying the person's exams and
 * planner entries. Pure: no Firebase, no clock beyond what is passed in.
 */

/** Signs uid + version, so resetting the link (a new version) kills the old one. */
export const feedSignature = (uid, version, secret) =>
  createHmac("sha256", secret).update(`calendar:${uid}:${version}`).digest("hex").slice(0, 32);

export const verifyFeed = (uid, version, signature, secret) => {
  if (!uid || !signature || !secret || !Number.isInteger(version)) return false;
  const expected = Buffer.from(feedSignature(uid, version, secret));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && timingSafeEqual(expected, given);
};

/** RFC 5545 text escaping. */
export const escapeText = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");

/** Lines longer than 75 octets continue on the next line after a space. */
export const foldLine = (line) => {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + char, "utf8") > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
};

const compactDate = (key) => String(key).replace(/-/g, "");

const nextDay = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

const stamp = (now) => now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const validKey = (key) => /^\d{4}-\d{2}-\d{2}$/.test(String(key || ""));
const validTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ""));

/** One VEVENT: all-day, or a 30-minute slot when the entry has a time. */
const event = ({ uid, date, time, summary, description }, now) => {
  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(now)}`];
  if (validTime(time)) {
    const [h, m] = time.split(":").map(Number);
    const end = h * 60 + m + 30;
    const pad = (n) => String(n).padStart(2, "0");
    // Floating local time: shown at that hour wherever the person is.
    lines.push(`DTSTART:${compactDate(date)}T${pad(h)}${pad(m)}00`);
    lines.push(end < 1440 ? `DTEND:${compactDate(date)}T${pad(Math.floor(end / 60))}${pad(end % 60)}00` : `DTEND:${compactDate(nextDay(date))}T000000`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(date))}`);
  }
  lines.push(`SUMMARY:${escapeText(summary)}`);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  return lines;
};

export const buildCalendar = ({ exams = [], plans = [], now = new Date() }) => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//U.Do//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:U.Do",
    "X-WR-CALDESC:Exams and plans from U.Do",
    // Ask subscribers to check back every few hours.
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
  ];

  exams.filter((exam) => validKey(exam.date) && exam.title).forEach((exam) => {
    lines.push(...event({
      uid: `exam-${exam.id}@u-do`,
      date: exam.date,
      summary: `Exam: ${exam.title}`,
      description: exam.subject ? `Subject: ${exam.subject}` : "",
    }, now));
  });

  plans.filter((plan) => validKey(plan.date) && plan.title).forEach((plan) => {
    lines.push(...event({
      uid: `plan-${plan.id}@u-do`,
      date: plan.date,
      time: plan.time,
      summary: plan.completed ? `✓ ${plan.title}` : plan.title,
    }, now));
  });

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};
