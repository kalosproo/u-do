import { fromDateKey, monthLabel, toDateKey } from "./dateKeys";
import { getHabitStreakSnapshot, getRecentWindowKeys, getWindowKeyForDate } from "./streaks";
import { inMonth, monthPrefix, netBalance, totalIncome, totalSpend } from "./financeReport";

/**
 * Every number the dashboard shows, derived from the user's own records.
 * Nothing here invents a value: an empty workspace produces zeros and the page
 * renders its empty states rather than filler.
 */

export const taskStats = (tasks, today = new Date()) => {
  const todayKey = toDateKey(today);
  const done = tasks.filter((task) => task.status === "done" || task.completed).length;
  const overdue = tasks.filter(
    (task) =>
      task.status !== "done" && !task.completed && task.dueDate && task.dueDate < todayKey
  ).length;
  const dueToday = tasks.filter(
    (task) => task.status !== "done" && !task.completed && task.dueDate === todayKey
  ).length;

  return {
    total: tasks.length,
    done,
    active: tasks.length - done,
    overdue,
    dueToday,
    rate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    byStatus: [
      { status: "To do", count: tasks.filter((t) => (t.status || "todo") === "todo").length },
      { status: "In progress", count: tasks.filter((t) => t.status === "progress").length },
      { status: "Done", count: done },
    ],
  };
};

export const habitStats = (habits, today = new Date()) => {
  const rows = habits.map((habit) => {
    const frequency = habit.frequency || "daily";
    const snapshot = getHabitStreakSnapshot(habit, today);
    const [currentWindow] = getRecentWindowKeys(frequency, 1, today);

    const completedWindows = new Set(
      Object.entries(habit.logs || {})
        .filter(([, done]) => done)
        .map(([dateKey]) => getWindowKeyForDate(new Date(`${dateKey}T00:00:00`), frequency))
    );

    return {
      id: habit.id,
      title: habit.title || "Untitled",
      frequency,
      streak: snapshot.currentStreak,
      streakState: snapshot.streakState,
      doneThisWindow: completedWindows.has(currentWindow),
    };
  });

  const doneNow = rows.filter((row) => row.doneThisWindow).length;

  return {
    rows,
    total: rows.length,
    doneNow,
    longestStreak: rows.reduce((top, row) => Math.max(top, row.streak), 0),
    rate: rows.length ? Math.round((doneNow / rows.length) * 100) : 0,
  };
};

export const financeStats = (expenses, today = new Date()) => {
  const thisMonth = inMonth(expenses, monthPrefix(today));

  return {
    balance: netBalance(thisMonth),
    income: totalIncome(thisMonth),
    spend: totalSpend(thisMonth),
    count: thisMonth.length,
    allTimeCount: expenses.length,
  };
};

export const plannerStats = (plans, today = new Date()) => {
  const todayKey = toDateKey(today);
  const todays = plans.filter((plan) => plan.date === todayKey);

  const upcoming = plans
    .filter((plan) => !plan.completed && (plan.date || "") >= todayKey)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .slice(0, 5);

  return {
    todayTotal: todays.length,
    todayDone: todays.filter((plan) => plan.completed).length,
    upcoming,
  };
};

/**
 * One cell per day for the last `days` days, counting real records dated that
 * day: habit ticks, transactions and planner entries. Tasks are not counted —
 * they carry a due date, not a completion date, so including them would be a
 * guess.
 */
export const activityByDay = (
  { habits = [], expenses = [], plans = [] },
  days = 56,
  today = new Date()
) => {
  const counts = new Map();

  const bump = (dateKey) => {
    if (dateKey) counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
  };

  habits.forEach((habit) =>
    Object.entries(habit.logs || {}).forEach(([dateKey, done]) => {
      if (done) bump(dateKey);
    })
  );
  expenses.forEach((entry) => bump(entry.date));
  plans.forEach((plan) => bump(plan.date));

  const cells = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - index));

    const key = toDateKey(date);
    const count = counts.get(key) || 0;

    return { date: key, count, level: count === 0 ? 0 : Math.min(4, Math.ceil(count / 2)) };
  });

  return {
    cells,
    activeDays: cells.filter((cell) => cell.count > 0).length,
    total: cells.reduce((sum, cell) => sum + cell.count, 0),
  };
};

/**
 * Lays the activity cells out as weeks so the grid can be drawn as columns of
 * seven rather than a row that wraps wherever the card happens to end — which
 * left a part-filled last row that read as a rendering fault.
 *
 * The run of days starts on an arbitrary weekday, so it is padded at the front
 * until the first real cell falls on its own row. Every column is then a whole
 * week, and a column's label is the month it starts in, printed only when that
 * differs from the column before it.
 */
export const activityWeekGrid = (cells = []) => {
  if (!cells.length) return { cells: [], weeks: [] };

  const pad = fromDateKey(cells[0].date).getDay();
  const padded = [...Array.from({ length: pad }, () => null), ...cells];

  // Trailing pad so the final column is whole and nothing is left mid-row.
  while (padded.length % 7 !== 0) padded.push(null);

  const weeks = [];
  let previous = null;

  for (let start = 0; start < padded.length; start += 7) {
    const first = padded.slice(start, start + 7).find(Boolean);
    const month = first ? monthLabel(first.date) : "";

    weeks.push({
      key: first ? first.date : `week-${start}`,
      // A repeated month name across neighbouring columns is noise, not a label.
      month: month && month !== previous ? month : "",
    });

    if (month) previous = month;
  }

  return { cells: padded, weeks };
};
