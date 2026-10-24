import { fromDateKey, toDateKey } from "../../utils/dateKeys";
import { getHabitStreakSnapshot, getRecentWindowKeys, getWindowKeyForDate } from "../../utils/streaks";

/**
 * Habit maths shared by ADHD mode's Habits screen and the Today strip,
 * worked out the same way as the Habits page: a daily habit counts by day,
 * a weekly one by week.
 */
const windowsOf = (habit, frequency) =>
  new Set(
    Object.entries(habit.logs || {})
      .filter(([, done]) => done)
      .map(([dateKey]) => getWindowKeyForDate(fromDateKey(dateKey), frequency))
  );

export const enrichHabit = (habit, today = new Date()) => {
  const frequency = habit.frequency || "daily";
  const windows = windowsOf(habit, frequency);
  const keys = getRecentWindowKeys(frequency, 7, today);
  return {
    ...habit,
    frequency,
    doneNow: windows.has(keys[keys.length - 1]),
    dots: keys.map((key) => windows.has(key)),
    streak: getHabitStreakSnapshot(habit, today).currentStreak,
  };
};

/** The logs after ticking or unticking this day (or this week, for a weekly habit). */
export const toggledLogs = (habit, today = new Date()) => {
  const frequency = habit.frequency || "daily";
  const current = getWindowKeyForDate(today, frequency);
  const inCurrent = (dateKey) => getWindowKeyForDate(fromDateKey(dateKey), frequency) === current;
  const logs = { ...(habit.logs || {}) };
  if (Object.keys(logs).some((dateKey) => logs[dateKey] && inCurrent(dateKey))) {
    Object.keys(logs).forEach((dateKey) => {
      if (inCurrent(dateKey)) delete logs[dateKey];
    });
  } else {
    logs[toDateKey(today)] = true;
  }
  return logs;
};
