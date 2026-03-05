import {
  addDoc,
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { getYesterdayKey, toDateKey } from "../utils/date";

const normalizeHabit = (id, data) => ({
  id,
  name: data.name || "Untitled Habit",
  streak: Number(data.streak || 0),
  longestStreak: Number(data.longestStreak || 0),
  completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
  lastCompletedDate: data.lastCompletedDate || null,
  createdAt: data.createdAt || null,
});

export const calculateStreak = ({ lastCompletedDate, streak, todayKey = toDateKey() }) => {
  if (!lastCompletedDate) {
    return { nextStreak: 1, alreadyCompletedToday: false };
  }

  if (lastCompletedDate === todayKey) {
    return { nextStreak: streak, alreadyCompletedToday: true };
  }

  const yesterdayKey = getYesterdayKey(todayKey);
  if (lastCompletedDate === yesterdayKey) {
    return { nextStreak: streak + 1, alreadyCompletedToday: false };
  }

  return { nextStreak: 1, alreadyCompletedToday: false };
};

export const createHabit = async ({ userId, name }) => {
  if (!userId) throw new Error("You must be signed in.");

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Habit name is required.");

  await addDoc(collection(db, "users", userId, "habits"), {
    name: trimmedName,
    createdAt: serverTimestamp(),
    streak: 0,
    longestStreak: 0,
    lastCompletedDate: "",
    completedDates: [],
  });
};

export const getHabits = async (userId) => {
  if (!userId) return [];

  const snapshot = await getDocs(collection(db, "users", userId, "habits"));
  return snapshot.docs
    .map((habitDoc) => normalizeHabit(habitDoc.id, habitDoc.data()))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const completeHabit = async ({ userId, habitId, todayKey = toDateKey() }) => {
  if (!userId) throw new Error("You must be signed in.");

  const habitRef = doc(db, "users", userId, "habits", habitId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(habitRef);

    if (!snapshot.exists()) {
      throw new Error("Habit not found.");
    }

    const habit = normalizeHabit(snapshot.id, snapshot.data());
    const { nextStreak, alreadyCompletedToday } = calculateStreak({
      lastCompletedDate: habit.lastCompletedDate,
      streak: habit.streak,
      todayKey,
    });

    if (alreadyCompletedToday) {
      return { ...habit, alreadyCompletedToday: true };
    }

    const completedDatesSet = new Set(habit.completedDates);
    completedDatesSet.add(todayKey);

    const updates = {
      streak: nextStreak,
      lastCompletedDate: todayKey,
      completedDates: Array.from(completedDatesSet).sort(),
      longestStreak: Math.max(habit.longestStreak, nextStreak),
    };

    transaction.update(habitRef, updates);

    return {
      ...habit,
      ...updates,
      alreadyCompletedToday: false,
    };
  });
};
