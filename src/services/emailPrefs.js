import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "./firebase";

const prefsDoc = (uid) => doc(db, "emailPrefs", uid);

/** Whether the daily summary email is switched on for this deployment. */
export const emailAvailable = async () => {
  try {
    const snapshot = await getDoc(doc(db, "appConfig", "email"));
    return snapshot.exists() && snapshot.data().enabled === true;
  } catch {
    return false;
  }
};

export const readEmailPrefs = async (uid) => {
  const snapshot = await getDoc(prefsDoc(uid));
  return snapshot.exists() ? snapshot.data() : null;
};

export const saveEmailPrefs = (uid, { daily, monthly, time }) =>
  setDoc(
    prefsDoc(uid),
    {
      uid,
      daily: Boolean(daily),
      monthly: Boolean(monthly),
      time,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
