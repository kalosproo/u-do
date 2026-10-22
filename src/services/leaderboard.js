import { deleteDoc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { listMutuals } from "./friends";
import { focusWeekDoc } from "./paths";

/**
 * The friends leaderboard. Each person publishes one number — this week's
 * focus minutes — next to their habit summary, readable by friends only.
 */

export const publishWeek = (uid, { week, minutes }) =>
  setDoc(focusWeekDoc(uid), { week, minutes: Math.round(minutes), updatedAt: serverTimestamp() });

export const clearWeek = (uid) => deleteDoc(focusWeekDoc(uid));

/** Mutuals with their published week, as { uid, name, photoURL, week, minutes }. */
export const loadFriendWeeks = async (uid) => {
  const mutuals = await listMutuals(uid);
  return Promise.all(
    mutuals.map(async (person) => {
      const week = await getDoc(focusWeekDoc(person.uid)).then((snap) => (snap.exists() ? snap.data() : null)).catch(() => null);
      return {
        uid: person.uid,
        name: person.displayName || (person.username ? `@${person.username}` : "A friend"),
        photoURL: person.photoURL || "",
        week: week?.week || "",
        minutes: Number(week?.minutes) || 0,
      };
    })
  );
};
