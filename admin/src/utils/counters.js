/** Same labels and month rules as the counters the server keeps. */
export const COUNTERS = [
  { field: "tasksActive", label: "Active tasks" },
  { field: "habits", label: "Habits" },
  { field: "friends", label: "Friends" },
  { field: "financeEntriesPerMonth", label: "Transactions this month", monthKey: "monthKey" },
  { field: "plannerEventsPerMonth", label: "Plans this month", monthKey: "monthKey" },
  { field: "aiRequestsPerMonth", label: "Assistant requests this month", monthKey: "aiMonthKey" },
];

/** "2026-10" in India time — the clock the server counts months on. */
export const currentMonthKey = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

