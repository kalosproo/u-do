import { addDoc, deleteDoc, getDocs, setDoc } from "firebase/firestore";
import { expenseDoc, expensesCollection } from "./paths";

export const expensesCacheKey = (uid) => `u_do_expenses_${uid}`;

export const readCachedExpenses = (uid) => {
  if (!uid) return [];
  try {
    const cached = localStorage.getItem(expensesCacheKey(uid));
    return cached ? JSON.parse(cached) : [];
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

/**
 * Picks whichever copy was written most recently.
 *
 * KNOWN BUG, preserved as-is by the restructure: entries written by the AI
 * Assistant store createdAt as a Firestore Timestamp with no updatedAt, and
 * `new Date(timestamp)` is an Invalid Date, so the comparison below goes NaN
 * and always keeps the local copy. After one AI-added transaction the page
 * stops picking up anything added on another device. Fixing it changes
 * behaviour, so it is deliberately left for its own change.
 */
export const pickLatestExpenses = (firebaseList, localList) => {
  if (firebaseList.length === 0) return localList;
  if (localList.length === 0) return firebaseList;

  const firebaseLatest = Math.max(
    ...firebaseList.map((entry) => new Date(entry.updatedAt || entry.createdAt).getTime())
  );
  const localLatest = Math.max(
    ...localList.map((entry) => new Date(entry.updatedAt || entry.createdAt).getTime())
  );

  return firebaseLatest >= localLatest ? firebaseList : localList;
};

export const fetchExpenses = async (uid) => {
  try {
    const snapshot = await getDocs(expensesCollection(uid));
    const remote = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const latest = pickLatestExpenses(remote, readCachedExpenses(uid));

    writeCachedExpenses(uid, latest);
    return latest;
  } catch {
    return readCachedExpenses(uid);
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

export const deleteExpense = async (uid, expenseId) => {
  try {
    await deleteDoc(expenseDoc(uid, expenseId));
  } catch {
    /* The local copy is already updated. */
  }
};
