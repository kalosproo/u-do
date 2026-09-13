import { addDoc, deleteDoc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { expenseDoc, expensesCollection } from "./paths";
import {
  PENDING_FLAG,
  mergeExpenses,
  normalizeExpense,
  stripLocalFields,
  toAmount,
} from "../utils/financeReport";

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
    const merged = mergeExpenses(remote, readCachedExpenses(uid));

    writeCachedExpenses(uid, merged);
    return merged;
  } catch {
    return readCachedExpenses(uid).map(normalizeExpense);
  }
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

export const editExpense = async (uid, expenseId, changes, currentList) => {
  const patch = await updateExpense(uid, expenseId, changes);
  const next = currentList.map((entry) =>
    entry.id === expenseId ? stripLocalFields({ ...entry, ...patch }) : entry
  );

  writeCachedExpenses(uid, next);
  return next;
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

/** Stamps updatedAt so the merge can tell this version is the newer one. */
export const updateExpense = async (uid, expenseId, changes) => {
  const patch = { ...changes, updatedAt: new Date().toISOString() };

  if (patch.amount !== undefined) patch.amount = toAmount(patch.amount);

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
