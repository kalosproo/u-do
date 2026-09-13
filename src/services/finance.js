import { addDoc, deleteDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { expenseDoc, expensesCollection } from "./paths";
import { mergeExpenses, normalizeExpense, toAmount } from "../utils/financeReport";

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
  try {
    await setDoc(expenseDoc(uid, expense.id), expense);
  } catch {
    await addDoc(expensesCollection(uid), expense);
  }
};

/** Stamps updatedAt so the merge can tell this version is the newer one. */
export const updateExpense = async (uid, expenseId, changes) => {
  const patch = { ...changes, updatedAt: new Date().toISOString() };

  if (patch.amount !== undefined) patch.amount = toAmount(patch.amount);

  await updateDoc(expenseDoc(uid, expenseId), patch);
  return patch;
};

export const deleteExpense = (uid, expenseId) => deleteDoc(expenseDoc(uid, expenseId));
