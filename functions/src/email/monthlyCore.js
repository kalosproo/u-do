import { APP_URL } from "./emailCore.js";

/**
 * The monthly report email, from plain data. The Firestore reads happen in
 * email.js; this only counts and writes, so it can be tested.
 */

const escape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const minutesLabel = (m) => {
  const total = Math.round(m || 0);
  const h = Math.floor(total / 60);
  return h ? `${h}h ${total % 60}m` : `${total}m`;
};

const rupees = (minor) => `₹${Math.round((minor || 0) / 100).toLocaleString("en-IN")}`;

const amountMinor = (entry) =>
  Number.isSafeInteger(entry.amountMinor) ? entry.amountMinor : Math.round((Number(entry.amount) || 0) * 100);

/** Last month's range when `dayKey` is the 1st, else null. */
export const previousMonth = (dayKey) => {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (d !== 1) return null;
  const start = new Date(Date.UTC(y, m - 2, 1));
  const end = new Date(Date.UTC(y, m - 1, 0));
  const key = (date) => date.toISOString().slice(0, 10);
  return {
    start: key(start),
    end: key(end),
    monthKey: key(start).slice(0, 7),
    label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
};

export const countMonth = ({ tasksDone = 0, habits = [], plans = [], expenses = [], focusDays = [] }, range) => {
  const inRange = (key) => key && key >= range.start && key <= range.end;
  let checkIns = 0;
  habits.forEach((habit) => {
    checkIns += Object.entries(habit.logs || {}).filter(([key, done]) => done && inRange(key)).length;
  });
  const monthPlans = plans.filter((plan) => inRange(plan.date));
  const money = expenses.filter((entry) => inRange(entry.date));
  const subjects = {};
  let focusMinutes = 0;
  focusDays.filter((day) => inRange(day.date)).forEach((day) => {
    focusMinutes += day.minutes || 0;
    Object.entries(day.subjects || {}).forEach(([name, m]) => {
      subjects[name] = (subjects[name] || 0) + (Number(m) || 0);
    });
  });
  const top = Object.entries(subjects).sort((a, b) => b[1] - a[1])[0];
  return {
    tasksDone,
    checkIns,
    plansDone: monthPlans.filter((p) => p.completed).length,
    plansTotal: monthPlans.length,
    moneyIn: money.filter((e) => e.type === "income").reduce((s, e) => s + amountMinor(e), 0),
    moneyOut: money.filter((e) => e.type !== "income").reduce((s, e) => s + amountMinor(e), 0),
    hasMoney: money.length > 0,
    focusMinutes,
    topSubject: top ? { name: top[0], minutes: top[1] } : null,
  };
};

/** The email, or null for a month with nothing in it. */
export const composeMonthly = ({ name, counts, label, unsubscribeUrl }) => {
  const c = counts;
  if (!c.tasksDone && !c.checkIns && !c.plansTotal && !c.hasMoney && !c.focusMinutes) return null;

  const first = String(name || "").trim().split(/\s+/)[0];
  const rows = [
    ["Tasks finished", String(c.tasksDone)],
    ["Focus time", minutesLabel(c.focusMinutes) + (c.topSubject ? ` — mostly ${c.topSubject.name}` : "")],
    ["Habit check-ins", String(c.checkIns)],
    ["Plans kept", c.plansTotal ? `${c.plansDone} of ${c.plansTotal}` : "—"],
    ["Money in · out", c.hasMoney ? `${rupees(c.moneyIn)} · ${rupees(c.moneyOut)}` : "—"],
  ];
  const subject = `Your ${label} on U.Do`;
  const text = [
    first ? `Hi ${first}, here's your ${label}.` : `Here's your ${label}.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `Open U.Do: ${APP_URL}/`,
    "",
    "You asked for this monthly report in U.Do. Stop these emails:",
    unsubscribeUrl,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
  <tr><td style="font:700 18px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#f2f2f2;padding-bottom:28px">U.Do</td></tr>
  <tr><td style="font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.08em;color:#8a8a8a;text-transform:uppercase">Monthly report</td></tr>
  <tr><td style="font:700 26px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#f2f2f2;letter-spacing:-.02em;padding:6px 0 18px">Your ${escape(label)}.</td></tr>
  ${rows.map(([k, v]) => `<tr><td style="padding:12px 0;border-top:1px solid #232323"><div style="font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#8a8a8a">${escape(k)}</div><div style="font:600 18px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#f2f2f2">${escape(v)}</div></td></tr>`).join("")}
  <tr><td style="padding-top:28px"><a href="${APP_URL}/" style="display:inline-block;background:#f2f2f2;color:#000;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,Roboto,sans-serif;padding:14px 22px;border-radius:10px">Open U.Do</a></td></tr>
  <tr><td style="padding-top:36px;font:12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#6f6f6f">You asked for this monthly report in U.Do. <a href="${escape(unsubscribeUrl)}" style="color:#9a9a9a">Stop these emails</a> or change it in Profile → Morning email.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
};
