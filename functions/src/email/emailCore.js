import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The daily summary email, as plain data: who it's for, what's due, and the
 * subject, HTML and text that say it. No network, so it can be tested.
 */

export const APP_URL = "https://u-do-sigma.vercel.app";
const SHOWN = 6;

const escape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Unsubscribe links are signed per account, so nobody can unsubscribe someone else. */
export const unsubscribeSignature = (uid, secret) =>
  createHmac("sha256", secret).update(`unsubscribe:${uid}`).digest("hex").slice(0, 32);

export const verifyUnsubscribe = (uid, signature, secret) => {
  if (!uid || !signature || !secret) return false;
  const expected = Buffer.from(unsubscribeSignature(uid, secret));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && timingSafeEqual(expected, given);
};

/** "07:30" → 450; anything else → the fallback. */
export const minutesOfTime = (value, fallback = 7 * 60 + 30) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return fallback;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 1440 ? minutes : fallback;
};

/** True during the half hour after the chosen time, so each 30-minute run sends once. */
export const isSendTime = (currentMinutes, chosenMinutes, runMinutes = 30) => {
  const since = (currentMinutes - chosenMinutes + 1440) % 1440;
  return since < runMinutes;
};

const list = (items, render) => {
  const shown = items.slice(0, SHOWN);
  const more = items.length - shown.length;
  return { shown: shown.map(render), more };
};

/**
 * The email for one person, or null when there's nothing to say — an empty
 * "nothing due" email every morning is how a sender gets marked as spam.
 */
export const composeDigest = ({ name, tasks = [], habits = [], plans = [], dayKey, unsubscribeUrl }) => {
  const overdue = tasks.filter((task) => task.dueDate && task.dueDate < dayKey);
  const today = tasks.filter((task) => task.dueDate === dayKey);
  if (!overdue.length && !today.length && !habits.length && !plans.length) return null;

  const first = String(name || "").trim().split(/\s+/)[0];
  const greeting = first ? `Good morning, ${first}.` : "Good morning.";

  const sections = [
    ["Overdue", overdue, (task) => task.title || "Untitled task"],
    ["Due today", today, (task) => (task.dueTime ? `${task.title || "Untitled task"} · ${task.dueTime}` : task.title || "Untitled task")],
    ["Planned for today", plans, (plan) => plan.title || "Untitled plan"],
    ["Habits to tick", habits, (habit) => habit.title || "Untitled habit"],
  ].filter(([, items]) => items.length);

  const counts = [
    today.length ? `${today.length} due today` : null,
    overdue.length ? `${overdue.length} overdue` : null,
    habits.length ? `${habits.length} ${habits.length === 1 ? "habit" : "habits"} to tick` : null,
  ].filter(Boolean);
  const subject = counts.length ? `Today: ${counts.join(", ")}` : `Today: ${plans.length} planned`;

  const text = [
    greeting,
    "",
    ...sections.flatMap(([title, items, render]) => {
      const { shown, more } = list(items, render);
      return [title.toUpperCase(), ...shown.map((line) => `- ${line}`), ...(more ? [`  and ${more} more`] : []), ""];
    }),
    `Open U.Do: ${APP_URL}/`,
    "",
    "You asked for this daily summary in U.Do. Stop these emails:",
    unsubscribeUrl,
  ].join("\n");

  const block = ([title, items, render]) => {
    const { shown, more } = list(items, render);
    return `
      <tr><td style="padding:18px 0 6px;font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.08em;color:#8a8a8a;text-transform:uppercase">${escape(title)}</td></tr>
      ${shown.map((line) => `<tr><td style="padding:7px 0;border-top:1px solid #232323;font:15px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#f2f2f2">${escape(line)}</td></tr>`).join("")}
      ${more ? `<tr><td style="padding:6px 0;font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#8a8a8a">and ${more} more</td></tr>` : ""}`;
  };

  const html = `<!doctype html><html><body style="margin:0;background:#000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
  <tr><td style="font:700 18px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#f2f2f2;padding-bottom:28px">U.Do</td></tr>
  <tr><td style="font:700 26px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#f2f2f2;letter-spacing:-.02em">${escape(greeting)}</td></tr>
  <tr><td style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#9a9a9a;padding-top:6px">Here's what today holds.</td></tr>
  ${sections.map(block).join("")}
  <tr><td style="padding-top:28px"><a href="${APP_URL}/" style="display:inline-block;background:#f2f2f2;color:#000;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,Roboto,sans-serif;padding:14px 22px;border-radius:10px">Open U.Do</a></td></tr>
  <tr><td style="padding-top:36px;font:12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#6f6f6f">You asked for this daily summary in U.Do. <a href="${escape(unsubscribeUrl)}" style="color:#9a9a9a">Stop these emails</a> or change the time in Profile → Reminders.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
};
