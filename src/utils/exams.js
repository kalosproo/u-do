import { toDateKey } from "./dateKeys.js";

const DAY = 86_400_000;

const atNoon = (key) => new Date(`${key}T12:00:00`);

/** Whole days from today to the exam: 0 on the day, negative once it's past. */
export const daysUntil = (dateKey, today = new Date()) =>
  Math.round((atNoon(dateKey) - atNoon(toDateKey(today))) / DAY);

/** Exams from today on, soonest first. */
export const upcomingExams = (exams = [], today = new Date()) =>
  exams
    .filter((exam) => exam.date && daysUntil(exam.date, today) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

const norm = (value) => String(value || "").trim().toLowerCase();

/**
 * Focus minutes logged against the exam's subject (or its title, when it has
 * none), across the days the log holds. Matching ignores case and spacing.
 */
export const minutesStudied = (exam, log = {}) => {
  const target = norm(exam.subject || exam.title);
  if (!target) return 0;
  let total = 0;
  Object.values(log).forEach((day) => {
    Object.entries(day?.subjects || {}).forEach(([name, minutes]) => {
      if (norm(name) === target) total += Number(minutes) || 0;
    });
  });
  return total;
};

/** "Today", "Tomorrow", "in 12 days". */
export const countdownLabel = (days) => (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`);
