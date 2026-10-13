/**
 * Pure helpers for usage counting. No Admin SDK in here, so they can be
 * tested on their own.
 *
 * Months are India time, the same clock the admin Overview uses for "today",
 * so a figure on one screen agrees with the figure on the next.
 */

const TZ_OFFSET_MINUTES = 330;

/** "2026-10" for the month this instant falls in, in India time. */
export const monthKeyFor = (date = new Date()) =>
  new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000).toISOString().slice(0, 7);

/**
 * The bounds of a month as date-key strings. Every `date` field in the
 * workspace is "YYYY-MM-DD", so a month is a string range and needs no
 * timezone arithmetic at query time: "-00" sorts before the 1st and "-99"
 * after the 31st.
 */
export const monthRange = (monthKey) => ({ from: `${monthKey}-00`, to: `${monthKey}-99` });

/** Which counter a workspace collection feeds, and whether it is per month. */
export const COUNTER_FOR = Object.freeze({
  tasks: { field: "tasksActive", monthly: false },
  habits: { field: "habits", monthly: false },
  expenses: { field: "financeEntriesPerMonth", monthly: true },
  planner: { field: "plannerEventsPerMonth", monthly: true },
});

/**
 * The activity a workspace write represents, or null when it is not worth an
 * event. Only the kind of thing that happened is recorded — never a title,
 * an amount or any other content. Admins can see that someone added a
 * transaction, not what it was.
 */
export const eventTypeFor = (collection, before, after) => {
  if (!before && after) {
    return {
      tasks: "task_created",
      habits: "habit_created",
      expenses: "transaction_added",
      planner: "plan_created",
    }[collection] || null;
  }

  if (collection === "tasks" && before && after) {
    const wasDone = before.completed === true || before.status === "done";
    const isDone = after.completed === true || after.status === "done";
    if (!wasDone && isDone) return "task_completed";
  }

  return null;
};
