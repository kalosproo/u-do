import { addDoc, deleteDoc, getDocs, updateDoc } from "firebase/firestore";
import { habitDoc, habitsCollection } from "./paths";
import { publishHabitSummary } from "./friends";

/** Scoped per account: an unscoped key let one account's cache show to another. */
export const habitsCacheKey = (uid) => `u_do_habits_${uid}`;

export const normalizeHabit = (raw) => ({
  id: raw.id,
  title: raw.title || "Untitled",
  frequency: raw.frequency || raw.type || "daily",
  logs: raw.logs || raw.completedDays || {},
  createdAt: raw.createdAt || new Date(),
});

const readCache = (uid) => {
  try {
    const cached = localStorage.getItem(habitsCacheKey(uid));
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
};

const writeCache = (uid, habits) => {
  try {
    localStorage.setItem(habitsCacheKey(uid), JSON.stringify(habits));
  } catch {
    /* The cache is best-effort. */
  }
};

/**
 * Loads habits, refreshes the offline cache, and republishes the card friends
 * see. Falls back to the cache when Firestore is unreachable.
 */
export const fetchHabits = async (user) => {
  try {
    const snapshot = await getDocs(habitsCollection(user.uid));
    const habits = snapshot.docs.map((item) => normalizeHabit({ id: item.id, ...item.data() }));

    writeCache(user.uid, habits);

    // Best-effort: a failure here must never stop you ticking a habit, and it
    // no-ops for accounts that never claimed a username.
    publishHabitSummary(user, habits).catch(() => {});

    return habits;
  } catch {
    return readCache(user.uid);
  }
};

export const createHabit = (uid, { title, frequency = "daily" }) =>
  addDoc(habitsCollection(uid), { title, frequency, createdAt: new Date(), logs: {} });

export const setHabitLogs = (uid, habitId, logs) => updateDoc(habitDoc(uid, habitId), { logs });

export const deleteHabit = (uid, habitId) => deleteDoc(habitDoc(uid, habitId));
