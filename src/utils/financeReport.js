import { recordTimestamp, todayKey } from "./dateKeys";

/**
 * Pure reporting over the expense book: merging, totals, chart aggregates and
 * CSV. No Firestore in here, so it can be exercised on its own.
 */

/** Amounts arrive from inputs as strings, and from older docs as anything. */
export const toAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export const normalizeExpense = (raw) => ({
  ...raw,
  title: raw.title || "Untitled",
  amount: toAmount(raw.amount),
  type: raw.type === "income" ? "income" : "expense",
  category: raw.category || "General",
  date: raw.date || todayKey(),
});

/**
 * Merges the remote and cached copies document by document, newest wins.
 *
 * This used to pick one list wholesale by comparing their newest timestamps,
 * which lost every entry held only by the other side. It also compared with
 * `new Date(...)`, which is an Invalid Date for the Firestore Timestamp shape
 * the AI Assistant writes, so the comparison went NaN and silently kept the
 * local copy forever. Both are handled here: recordTimestamp understands every
 * shape, and nothing is dropped for being on one side only.
 *
 * Caveat: an entry deleted remotely while this device was offline reappears,
 * because a cached copy is indistinguishable from one not yet synced.
 */
export const mergeExpenses = (remoteList, cachedList) => {
  const byId = new Map();

  const absorb = (entry) => {
    if (!entry?.id) return;

    const normalized = normalizeExpense(entry);
    const existing = byId.get(normalized.id);

    if (!existing || recordTimestamp(normalized) >= recordTimestamp(existing)) {
      byId.set(normalized.id, normalized);
    }
  };

  (remoteList || []).forEach(absorb);
  (cachedList || []).forEach(absorb);

  return [...byId.values()];
};

/** Builds a record with both timestamps as ISO strings, the one shape everything reads. */
export const buildExpense = ({ title, amount, type, category, date }) => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: String(title || "").trim() || "Untitled",
    amount: toAmount(amount),
    type: type === "income" ? "income" : "expense",
    category: category || "General",
    date: date || todayKey(),
    createdAt: now,
    updatedAt: now,
  };
};

export const isIncome = (entry) => entry.type === "income";

export const sumAmount = (entries) =>
  entries.reduce((total, entry) => total + toAmount(entry.amount), 0);

export const totalIncome = (entries) => sumAmount(entries.filter(isIncome));

export const totalSpend = (entries) => sumAmount(entries.filter((entry) => !isIncome(entry)));

/** Income minus spending over whatever set is passed in. */
export const netBalance = (entries) => totalIncome(entries) - totalSpend(entries);

/** Date keys are YYYY-MM-DD, so a month is a string prefix — no timezone involved. */
export const monthPrefix = (date = new Date()) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;

export const inMonth = (entries, prefix) =>
  entries.filter((entry) => (entry.date || "").startsWith(prefix));

export const sortByDateDesc = (entries) =>
  [...entries].sort((a, b) => {
    const byDate = (b.date || "").localeCompare(a.date || "");
    return byDate !== 0 ? byDate : recordTimestamp(b) - recordTimestamp(a);
  });

/** Spend per category, largest first. Income is excluded. */
export const spendByCategory = (entries) => {
  const totals = new Map();

  entries
    .filter((entry) => !isIncome(entry))
    .forEach((entry) => {
      const category = entry.category || "General";
      totals.set(category, (totals.get(category) || 0) + toAmount(entry.amount));
    });

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
};

/** Income and spend per month across the last `count` months, oldest first. */
export const monthlyTotals = (entries, count = 6, fromDate = new Date()) => {
  const months = Array.from({ length: count }, (_, index) => {
    const date = new Date(fromDate.getFullYear(), fromDate.getMonth() - (count - 1 - index), 1);
    return {
      prefix: monthPrefix(date),
      label: date.toLocaleDateString(undefined, { month: "short" }),
    };
  });

  return months.map(({ prefix, label }) => {
    const slice = inMonth(entries, prefix);
    return { month: label, prefix, income: totalIncome(slice), spend: totalSpend(slice) };
  });
};

/** RFC 4180 quoting: a title with a comma or quote used to shift every column. */
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export const expensesToCSV = (entries) => {
  if (!entries.length) return "";

  const headers = ["Date", "Title", "Category", "Type", "Amount"];
  const rows = sortByDateDesc(entries).map((entry) =>
    [entry.date, entry.title, entry.category, entry.type, toAmount(entry.amount)]
      .map(csvCell)
      .join(",")
  );

  return [headers.map(csvCell).join(","), ...rows].join("\n");
};
