/**
 * When a repeating task comes back.
 *
 * Pure date arithmetic on "YYYY-MM-DD" keys — no Date objects crossing a
 * timezone boundary, no Firestore, no clock. A task due "today" is a calendar
 * fact in the person's own day, not an instant, so treating these as strings is
 * what keeps a 23:30 task from sliding into tomorrow for anyone east of UTC.
 */

export const REPEAT_KINDS = Object.freeze(["none", "daily", "weekly", "monthly"]);

export const EMPTY_REPEAT = Object.freeze({ kind: "none", days: [] });

/** Sunday is 0, matching Date#getUTCDay and every weekday picker people know. */
export const WEEKDAYS = Object.freeze([
  { value: 0, short: "S", label: "Sunday" },
  { value: 1, short: "M", label: "Monday" },
  { value: 2, short: "T", label: "Tuesday" },
  { value: 3, short: "W", label: "Wednesday" },
  { value: 4, short: "T", label: "Thursday" },
  { value: 5, short: "F", label: "Friday" },
  { value: 6, short: "S", label: "Saturday" },
]);

const parse = (key) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Rejects 2026-02-31 and friends, which Date would silently roll forward.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null;
  return date;
};

const format = (date) => date.toISOString().slice(0, 10);

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

/** Days in a month, so a monthly repeat can clamp instead of overflowing. */
const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export const normalizeRepeat = (raw) => {
  const kind = REPEAT_KINDS.includes(raw?.kind) ? raw.kind : "none";

  if (kind !== "weekly") return { kind, days: [] };

  const days = [...new Set((raw?.days || []).map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);

  // Weekly with no day chosen would never come back. Fall through to none
  // rather than create a task that silently disappears forever.
  return days.length > 0 ? { kind: "weekly", days } : { kind: "none", days: [] };
};

export const isRepeating = (repeat) => normalizeRepeat(repeat).kind !== "none";

/**
 * The next date a repeat lands on, strictly after `fromKey`.
 *
 * Strictly after matters: completing today's occurrence must not produce
 * another one dated today, which would be immediately overdue and would nag
 * the moment it was created.
 *
 * Monthly clamps rather than overflows — the 31st becomes the 28th in
 * February, not the 3rd of March. Someone who set "rent on the 31st" means the
 * end of the month.
 */
export const nextOccurrence = (fromKey, repeat) => {
  const rule = normalizeRepeat(repeat);
  const from = parse(fromKey);

  if (rule.kind === "none" || !from) return "";

  if (rule.kind === "daily") return format(addDays(from, 1));

  if (rule.kind === "weekly") {
    for (let step = 1; step <= 7; step += 1) {
      const candidate = addDays(from, step);
      if (rule.days.includes(candidate.getUTCDay())) return format(candidate);
    }
    return "";
  }

  // Monthly, on the same date each month.
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();
  const nextMonth = month + 1;

  const targetYear = year + Math.floor(nextMonth / 12);
  const targetMonth = nextMonth % 12;

  return format(
    new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)))),
  );
};

/** How the rule reads on a task row. Short, because it sits beside a date. */
export const describeRepeat = (repeat) => {
  const rule = normalizeRepeat(repeat);

  if (rule.kind === "none") return "";
  if (rule.kind === "daily") return "Daily";
  if (rule.kind === "monthly") return "Monthly";

  if (rule.days.length === 7) return "Daily";
  if (rule.days.length === 5 && [1, 2, 3, 4, 5].every((day) => rule.days.includes(day))) {
    return "Weekdays";
  }
  if (rule.days.length === 2 && rule.days.includes(0) && rule.days.includes(6)) {
    return "Weekends";
  }

  return rule.days.map((day) => WEEKDAYS[day].label.slice(0, 3)).join(" ");
};
