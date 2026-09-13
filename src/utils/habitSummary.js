import { getHabitStreakSnapshot, getRecentWindowKeys, getWindowKeyForDate } from "./streaks";
import { fromDateKey } from "./dateKeys";

// How far back a shared completion rate looks, in windows for that frequency.
const RATE_WINDOW_COUNT = { daily: 30, weekly: 12 };
const SHARED_DOT_COUNT = 7;

/**
 * Reduces raw habits to the streak/progress card friends are allowed to see.
 * Nothing else from the workspace leaves this function: no logs, no dates, no
 * tasks and no finance data.
 */
export const buildHabitSummary = (habits, today = new Date()) => {
  const entries = (habits || []).map((habit) => {
    const frequency = habit.frequency || "daily";

    const completedWindows = new Set();
    Object.entries(habit.logs || {}).forEach(([dateKey, done]) => {
      if (!done) return;
      completedWindows.add(getWindowKeyForDate(fromDateKey(dateKey), frequency));
    });

    const snapshot = getHabitStreakSnapshot(habit, today);
    const rateCount = RATE_WINDOW_COUNT[frequency] || RATE_WINDOW_COUNT.daily;
    const rateKeys = getRecentWindowKeys(frequency, rateCount, today);
    const recentKeys = getRecentWindowKeys(frequency, SHARED_DOT_COUNT, today);

    return {
      id: habit.id,
      title: habit.title || "Untitled",
      frequency,
      streak: snapshot.currentStreak,
      bestStreak: Math.max(snapshot.bestStreak, snapshot.currentStreak),
      streakState: snapshot.streakState,
      completionRate: Math.round(
        (rateKeys.filter((key) => completedWindows.has(key)).length / rateCount) * 100
      ),
      dots: recentKeys.map((key) => completedWindows.has(key)),
      doneThisWindow: completedWindows.has(recentKeys[recentKeys.length - 1]),
    };
  });

  return {
    habits: entries,
    longestStreak: entries.reduce((longest, habit) => Math.max(longest, habit.streak), 0),
    doneCount: entries.filter((habit) => habit.doneThisWindow).length,
    totalCount: entries.length,
  };
};
