import { addDoc, deleteDoc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { expenseDoc, expensesCollection } from "./paths";
import {
  MAX_CATEGORY_LENGTH,
  MAX_TITLE_LENGTH,
  PENDING_FLAG,
  clipLabel,
  isPending,
  mergeExpenses,
  normalizeExpense,
  stripLocalFields,
} from "../utils/financeReport";
import {
  DEFAULT_CURRENCY,
  MAX_AMOUNT_MINOR,
  fromMinor,
  isKnownCurrency,
  parseMinor,
} from "../utils/money";

export const expensesCacheKey = (uid) => `u_do_expenses_${uid}`;

export const readCachedExpenses = (uid) => {
  if (!uid) return [];

  try {
    const cached = localStorage.getItem(expensesCacheKey(uid));
    const parsed = cached ? JSON.parse(cached) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeCachedExpenses = (uid, expenses) => {
  if (!uid) return;

  try {
    localStorage.setItem(expensesCacheKey(uid), JSON.stringify(expenses));
  } catch {
    /* The cache is best-effort. */
  }
};

export const fetchExpenses = async (uid) => {
  try {
    const snapshot = await getDocs(expensesCollection(uid));
    const remote = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const merged = await resendPending(uid, mergeExpenses(remote, readCachedExpenses(uid)));

    writeCachedExpenses(uid, merged);
    return merged;
  } catch {
    return readCachedExpenses(uid).map(normalizeExpense);
  }
};

/**
 * Sends every transaction still waiting on Firestore.
 *
 * A failed add has always been kept on the device, flagged pending, under a
 * message promising it would sync — and nothing ever sent it. It sat in this
 * browser's storage, absent from every other device, until the cache was
 * cleared and it was gone.
 *
 * The case that matters most arrives with the rules that validate expense
 * documents. A tab still running the bundle from before minor units writes a
 * record the rules refuse, and keeps it pending in the old shape. By the time
 * this runs that record has been through mergeExpenses and normalised to the
 * current shape, so the retry is a write the rules accept rather than the same
 * refusal again.
 *
 * Written at the entry's own id, so a retry of something that did in fact
 * land is an overwrite with the same body, never a second copy.
 */
const resendPending = async (uid, list) => {
  const pending = list.filter(isPending);
  if (!pending.length) return list;

  const sent = new Set();

  await Promise.all(
    pending.map(async (entry) => {
      try {
        await setDoc(expenseDoc(uid, entry.id), stripLocalFields(entry));
        sent.add(entry.id);
      } catch {
        // Still pending. The next load tries again.
      }
    })
  );

  return list.map((entry) => (sent.has(entry.id) ? stripLocalFields(entry) : entry));
};

/** Writes at a known id so the local copy and the remote copy share one identity. */
export const saveExpense = async (uid, expense) => {
  const body = stripLocalFields(expense);

  try {
    await setDoc(expenseDoc(uid, body.id), body);
  } catch {
    await addDoc(expensesCollection(uid), body);
  }
};

/**
 * Adds a transaction: cached immediately so the page updates, flagged pending
 * until Firestore confirms it. The flag is what stops an unsynced entry being
 * mistaken later for one deleted on another device.
 */
export const addExpense = async (uid, expense, currentList) => {
  const optimistic = [...currentList, { ...expense, [PENDING_FLAG]: true }];
  writeCachedExpenses(uid, optimistic);

  try {
    await saveExpense(uid, expense);

    const confirmed = optimistic.map((entry) => (entry.id === expense.id ? expense : entry));
    writeCachedExpenses(uid, confirmed);

    return { list: confirmed, error: null };
  } catch (error) {
    return { list: optimistic, error };
  }
};

/**
 * Edits a transaction by writing every validated field, not only the ones
 * that changed.
 *
 * The rules check the whole document after the write. A record from before
 * minor units has no `amountMinor` and no `currency`, so a patch that renames
 * it — which is exactly what the assistant's rename tool sends — would leave a
 * document the rules refuse, and the edit would fail on a field nobody
 * touched. Writing the full shape means the first edit of an old record is
 * also the one that brings it up to date.
 */
export const editExpense = async (uid, expenseId, changes, currentList) => {
  const current = currentList.find((entry) => entry.id === expenseId);
  const patch = await updateExpense(uid, expenseId, completeRecord(current, changes));
  const next = currentList.map((entry) =>
    entry.id === expenseId ? stripLocalFields(normalizeExpense({ ...entry, ...patch })) : entry
  );

  writeCachedExpenses(uid, next);
  return next;
};

/** The current record's validated fields, overlaid with what is changing. */
const completeRecord = (current, changes) => {
  if (!current) return changes;

  const base = normalizeExpense(current);
  const changingAmount = changes.amount !== undefined || changes.amountMinor !== undefined;

  return {
    title: base.title,
    type: base.type,
    category: base.category,
    date: base.date,
    ...(changingAmount ? {} : { amountMinor: base.amountMinor }),
    currency: base.currency,
    ...changes,
  };
};

/**
 * Removes a transaction everywhere. The cache is only rewritten once Firestore
 * confirms, so a failed delete does not hide an entry that still exists.
 */
export const removeExpense = async (uid, expenseId, currentList) => {
  await deleteExpense(uid, expenseId);

  const next = currentList.filter((entry) => entry.id !== expenseId);
  writeCachedExpenses(uid, next);

  return next;
};

/**
 * Stamps updatedAt so the merge can tell this version is the newer one, and
 * refuses a patch that would put an amount the book cannot represent into the
 * database.
 *
 * The old version ran the amount through a helper that answered 0 for
 * anything it could not read, so editing a row to "banana" set it to ₹0 and
 * said nothing. An amount that is not an amount is now an error the caller has
 * to show.
 */
export const updateExpense = async (uid, expenseId, changes) => {
  const patch = { ...changes, updatedAt: new Date().toISOString() };

  if (patch.title !== undefined) patch.title = clipLabel(patch.title, MAX_TITLE_LENGTH) || "Untitled";
  if (patch.category !== undefined) {
    patch.category = clipLabel(patch.category, MAX_CATEGORY_LENGTH) || "General";
  }
  if (patch.type !== undefined) patch.type = patch.type === "income" ? "income" : "expense";

  // A cleared date box used to be stored as "" and quietly shown as today.
  // Moving someone's transaction to a different day is not a fallback.
  if (patch.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(patch.date))) {
    throw new Error("Pick a date for this transaction.");
  }

  if (patch.amount !== undefined || patch.amountMinor !== undefined) {
    const currency = isKnownCurrency(patch.currency) ? patch.currency : DEFAULT_CURRENCY;
    const minor =
      patch.amountMinor !== undefined ? patch.amountMinor : parseMinor(patch.amount, currency);

    if (minor === null || !Number.isSafeInteger(minor)) {
      throw new Error("Enter the amount as plain digits, like 1250.50.");
    }
    if (minor <= 0) throw new Error("Amount has to be more than zero.");
    if (minor > MAX_AMOUNT_MINOR) throw new Error("That amount is too large to record.");

    patch.amountMinor = minor;
    patch.amount = fromMinor(minor, currency);
    patch.currency = currency;
  }

  await updateDoc(expenseDoc(uid, expenseId), patch);
  return patch;
};

export const deleteExpense = (uid, expenseId) => deleteDoc(expenseDoc(uid, expenseId));

/** Deletes every transaction for this account and nothing else. */
export const clearExpenses = async (uid) => {
  const snapshot = await getDocs(expensesCollection(uid));
  const batch = writeBatch(db);

  snapshot.docs.forEach((item) => batch.delete(expenseDoc(uid, item.id)));
  await batch.commit();

  writeCachedExpenses(uid, []);
  return snapshot.size;
};
