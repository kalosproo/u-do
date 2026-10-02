import { recordTimestamp, todayKey } from "./dateKeys.js";
import {
  DEFAULT_CURRENCY,
  MAX_AMOUNT_MINOR,
  fromMinor,
  parseMinor,
  readCurrency,
  readMinor,
  sumMinor,
  toDecimalString,
} from "./money.js";

/**
 * Pure reporting over the expense book: merging, totals, chart aggregates and
 * CSV. No Firestore in here, so it can be exercised on its own.
 *
 * Every total below is in integer minor units, and so is every `amountMinor`
 * on a record. Nothing in this file produces a fractional currency value, so
 * there is never a figure to round before it reaches a person.
 */

/** Longest title we will store. A ledger row is a label, not a document. */
export const MAX_TITLE_LENGTH = 120;
export const MAX_CATEGORY_LENGTH = 60;

/**
 * Trims and caps a label to `limit` UTF-16 units — the same unit the rules'
 * `size()` counts, measured against the emulator rather than assumed: 120
 * Devanagari or Telugu characters are accepted, 61 emoji are not.
 *
 * A plain slice can end halfway through a surrogate pair and store half an
 * emoji, so a dangling high surrogate is dropped rather than kept.
 */
export const clipLabel = (value, limit) => {
  const clipped = String(value ?? "").trim().slice(0, limit);
  const last = clipped.charCodeAt(clipped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
};

const trimmed = clipLabel;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const safeDate = (value) => (DATE_KEY.test(String(value || "")) ? value : todayKey());

/** Keeps a stored figure inside the range the rules will accept. */
const clampMinor = (minor) => {
  if (!Number.isSafeInteger(minor)) return 0;
  return Math.max(-MAX_AMOUNT_MINOR, Math.min(MAX_AMOUNT_MINOR, minor));
};

/**
 * Brings a record into the shape everything downstream reads, whichever shape
 * it was stored in.
 *
 * `amountMinor` is the truth. `amount` is kept beside it as the same figure in
 * major units, so a client still running the bundle that predates this change
 * keeps reading a correct number rather than a missing one — see readMinor for
 * why that mirror is also what lets an edit made on an old client win.
 */
export const normalizeExpense = (raw) => {
  const currency = readCurrency(raw);
  const amountMinor = clampMinor(readMinor(raw, currency));

  return {
    ...raw,
    title: trimmed(raw.title, MAX_TITLE_LENGTH) || "Untitled",
    amountMinor,
    amount: fromMinor(amountMinor, currency),
    currency,
    type: raw.type === "income" ? "income" : "expense",
    category: trimmed(raw.category, MAX_CATEGORY_LENGTH) || "General",
    date: safeDate(raw.date),
  };
};

/** The amount on a record, in minor units, whatever shape it was stored in. */
export const amountMinorOf = (entry) => clampMinor(readMinor(entry, readCurrency(entry)));

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

/**
 * Builds a record with both timestamps as ISO strings, the one shape
 * everything reads.
 *
 * Throws on an amount that is not one. Every caller — the form, the AI tool,
 * quick capture — checked for itself before this, each with slightly different
 * rules, and the weakest of them decided what reached the database.
 */
export const buildExpense = ({ title, amount, type, category, date, currency }) => {
  const now = new Date().toISOString();
  const code = currency || DEFAULT_CURRENCY;
  const amountMinor = parseMinor(amount, code);

  if (amountMinor === null) throw new Error("Enter the amount as plain digits, like 1250.50.");
  if (amountMinor <= 0) throw new Error("Amount has to be more than zero.");
  if (amountMinor > MAX_AMOUNT_MINOR) throw new Error("That amount is too large to record.");

  return {
    id: crypto.randomUUID(),
    title: trimmed(title, MAX_TITLE_LENGTH) || "Untitled",
    amountMinor,
    amount: fromMinor(amountMinor, code),
    currency: code,
    type: type === "income" ? "income" : "expense",
    category: trimmed(category, MAX_CATEGORY_LENGTH) || "General",
    date: safeDate(date),
    createdAt: now,
    updatedAt: now,
  };
};

export const isIncome = (entry) => entry.type === "income";

/** Integer addition. Every figure below is in minor units, start to finish. */
export const sumAmount = (entries) => sumMinor(entries.map(amountMinorOf));

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

/**
 * Spend per category, largest first. Income is excluded.
 *
 * The figure is named `amountMinor` rather than `amount` on purpose: it is in
 * minor units, and a key called `amount` beside a record whose `amount` is in
 * major units is how the two silently get added together.
 */
export const spendByCategory = (entries) => {
  const totals = new Map();

  entries
    .filter((entry) => !isIncome(entry))
    .forEach((entry) => {
      const category = entry.category || "General";
      totals.set(category, (totals.get(category) || 0) + amountMinorOf(entry));
    });

  return [...totals.entries()]
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .filter((row) => row.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);
};

/**
 * Income and spend per month across the last `count` months, oldest first.
 * Both figures are in minor units; the keys keep their names because they are
 * the chart series names a reader sees in the legend.
 */
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

  // Amount is the exact major-unit decimal rather than a bare number, and the
  // currency travels with it: a column of "12.5" in a file with no currency
  // anywhere states neither its scale nor its unit.
  const headers = ["Date", "Title", "Category", "Type", "Currency", "Amount"];
  const rows = sortByDateDesc(entries).map((entry) => {
    const currency = readCurrency(entry);

    return [
      entry.date,
      entry.title,
      entry.category,
      entry.type,
      currency,
      toDecimalString(amountMinorOf(entry), currency),
    ]
      .map(csvCell)
      .join(",");
  });

  return [headers.map(csvCell).join(","), ...rows].join("\n");
};
