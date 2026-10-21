import { toDateKey } from "./dateKeys.js";
import { weeklyReview } from "./weeklyReview.js";

/**
 * The monthly report: last month, shown on the 1st to the 3rd. The counting
 * is the weekly review's over a longer range, plus focus time against the
 * month before.
 */

const monthRange = (year, month) => {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return { start: toDateKey(start), end: toDateKey(end), label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
};

/** Last month's range on days 1–3, otherwise null. */
export const reportMonthFor = (today = new Date()) => {
  if (today.getDate() > 3) return null;
  return monthRange(today.getFullYear(), today.getMonth() - 1);
};

const focusIn = (log, range) => {
  let minutes = 0;
  let sessions = 0;
  const subjects = {};
  Object.entries(log || {}).forEach(([key, day]) => {
    if (key < range.start || key > range.end) return;
    minutes += day.minutes || 0;
    sessions += day.sessions || 0;
    Object.entries(day.subjects || {}).forEach(([name, m]) => {
      subjects[name] = (subjects[name] || 0) + (Number(m) || 0);
    });
  });
  const top = Object.entries(subjects).sort((a, b) => b[1] - a[1])[0];
  return { minutes, sessions, topSubject: top ? { name: top[0], minutes: top[1] } : null };
};

export const monthlyReport = (data, month, focusLog = {}) => {
  const base = weeklyReview(data, month);
  const [y, m] = month.start.split("-").map(Number);
  const before = monthRange(y, m - 2);
  const focus = focusIn(focusLog, month);
  const focusBefore = focusIn(focusLog, before);
  return {
    ...base,
    focusMinutes: focus.minutes,
    focusSessions: focus.sessions,
    topSubject: focus.topSubject,
    focusChange: focusBefore.minutes ? Math.round(((focus.minutes - focusBefore.minutes) / focusBefore.minutes) * 100) : null,
    empty: base.empty && !focus.minutes,
  };
};
