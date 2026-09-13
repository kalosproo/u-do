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
 * Marks a cached entry that has not reached Firestore yet. Local only — it is
 * stripped before any write, so it never becomes a document field.
 */
export const PENDING_FLAG = "__pendingSync";

export const isPending = (entry) => Boolean(entry?.[PENDING_FLAG]);

/** Drops local-only bookkeeping so a record is safe to persist. */
export const stripLocalFields = (entry) => {
  const clean = { ...entry };
  delete clean[PENDING_FLAG];
  return clean;
};

/**
 * Merges the remote and cached copies document by document, newest wins.
 *
 * Two bugs lived here. It used to pick one list wholesale by comparing their
 * newest timestamps, discarding every entry held only by the other side; and
 * it compared with `new Date(...)`, which is an Invalid Date for the Firestore
 * Timestamp shape the AI Assistant writes, so the comparison went NaN and
 * silently kept the local copy forever.
 *
 * A cached entry the server does not have is only kept when it is still
 * pending. Once an entry has synced, the server is authoritative about whether
 * it exists, so one deleted on another device stays deleted instead of being
 * resurrected from this device's cache.
 */
export const mergeExpenses = (remoteList, cachedList) => {
  const remote = (remoteList || []).filter((entry) => entry?.id);
  const remoteIds = new Set(remote.map((entry) => entry.id));
  const byId = new Map();

  const absorb = (entry) => {
    const normalized = normalizeExpense(entry);
    const existing = byId.get(normalized.id);

    if (!existing || recordTimestamp(normalized) >= recordTimestamp(existing)) {
      byId.set(normalized.id, normalized);
    }
  };

  remote.forEach(absorb);

  (cachedList || []).forEach((entry) => {
    if (!entry?.id) return;

    // Synced, and the server no longer lists it: deleted elsewhere.
    if (!remoteIds.has(entry.id) && !isPending(entry)) return;

    absorb(entry);
  });

  // Only an entry the server confirms is safe to call synced. Stripping the
  // flag from one still in flight would make the next merge drop it.
  return [...byId.values()].map((entry) =>
    remoteIds.has(entry.id) ? stripLocalFields(entry) : entry
  );
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
