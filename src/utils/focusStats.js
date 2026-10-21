import { toDateKey } from "./dateKeys.js";

/**
 * Everything the Focus page shows, from the per-day log. Pure, so it can be
 * tested: give it the log and "today" and it gives back the numbers.
 */

const dayKey = (today, offset) =>
  toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset));

export const focusStats = (log = {}, today = new Date()) => {
  const minutesOn = (key) => log[key]?.minutes || 0;

  const mondayOffset = (today.getDay() + 6) % 7;
  let week = 0;
  for (let i = 0; i <= mondayOffset; i += 1) week += minutesOn(dayKey(today, i));

  const monthPrefix = toDateKey(today).slice(0, 7);
  let month = 0;
  let sessions = 0;
  let best = null;
  Object.entries(log).forEach(([key, day]) => {
    if (key.startsWith(monthPrefix)) month += day.minutes || 0;
    sessions += day.sessions || 0;
    if (!best || (day.minutes || 0) > best.minutes) best = { key, minutes: day.minutes || 0 };
  });

  // A streak counts back from today; a day with nothing yet today doesn't
  // break it until the day is over.
  let streak = 0;
  for (let i = minutesOn(dayKey(today, 0)) > 0 ? 0 : 1; i < 400; i += 1) {
    if (minutesOn(dayKey(today, i)) > 0) streak += 1;
    else break;
  }

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const key = dayKey(today, 13 - i);
    return { key, minutes: minutesOn(key) };
  });

  const subjectTotals = {};
  for (let i = 0; i < 30; i += 1) {
    const subjects = log[dayKey(today, i)]?.subjects || {};
    Object.entries(subjects).forEach(([name, minutes]) => {
      subjectTotals[name] = (subjectTotals[name] || 0) + (Number(minutes) || 0);
    });
  }
  const subjects = Object.entries(subjectTotals)
    .map(([name, minutes]) => ({ name, minutes }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  return {
    today: minutesOn(dayKey(today, 0)),
    week,
    month,
    streak,
    sessions,
    best: best && best.minutes > 0 ? best : null,
    last14,
    subjects,
  };
};
