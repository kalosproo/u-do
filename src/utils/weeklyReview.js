import { toDateKey } from "./dateKeys.js";
import { totalIncome, totalSpend } from "./financeReport.js";

/**
 * The weekly review: one week, Monday to Sunday, counted from records only.
 *
 * Shown on Sunday for the week that is ending and on Monday for the one
 * just gone. Tasks count only when they carry a completedAt — older tasks
 * were ticked before that was recorded, and guessing would be inventing.
 */

const DAY = 86_400_000;

const mondayOf = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - offset);
  return start;
};

/** The week the review is about on this day, or null on days it isn't shown. */
export const reviewWeekFor = (today = new Date()) => {
  const day = today.getDay();
  if (day !== 0 && day !== 1) return null;
  const monday = mondayOf(day === 1 ? new Date(today.getTime() - DAY) : today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateKey(monday), end: toDateKey(sunday), isPast: day === 1 };
};

const within = (key, week) => Boolean(key) && key >= week.start && key <= week.end;

const completedKey = (task) => {
  const at = task.completedAt;
  const date = at?.toDate?.() || (at instanceof Date ? at : at ? new Date(at) : null);
  return date && !Number.isNaN(date.getTime()) ? toDateKey(date) : "";
};

export const weeklyReview = ({ tasks = [], habits = [], plans = [], expenses = [] }, week) => {
  const tasksDone = tasks.filter(
    (task) => (task.status === "done" || task.completed) && within(completedKey(task), week)
  ).length;

  let checkIns = 0;
  let topHabit = null;
  habits.forEach((habit) => {
    const count = Object.entries(habit.logs || {}).filter(([key, done]) => done && within(key, week)).length;
    checkIns += count;
    if (count > 0 && (!topHabit || count > topHabit.count)) topHabit = { title: habit.title || "Untitled", count };
  });

  const weekPlans = plans.filter((plan) => within(plan.date, week));
  const weekMoney = expenses.filter((entry) => within(entry.date, week));

  return {
    tasksDone,
    checkIns,
    topHabit,
    plansDone: weekPlans.filter((plan) => plan.completed).length,
    plansTotal: weekPlans.length,
    moneyIn: totalIncome(weekMoney),
    moneyOut: totalSpend(weekMoney),
    hasMoney: weekMoney.length > 0,
    empty: !tasksDone && !checkIns && !weekPlans.length && !weekMoney.length,
  };
};
