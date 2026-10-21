import { getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { badgesDoc } from "./paths";

/** { [badgeId]: "YYYY-MM-DD" } — when each was earned. Friends can read it. */
export const loadEarned = async (uid) => {
  try {
    const snapshot = await getDoc(badgesDoc(uid));
    return snapshot.exists() ? snapshot.data().badges || {} : {};
  } catch {
    return {};
  }
};

/** Adds newly earned badges; never removes one. */
export const saveEarned = (uid, additions) =>
  setDoc(badgesDoc(uid), { badges: additions, updatedAt: serverTimestamp() }, { merge: true });
