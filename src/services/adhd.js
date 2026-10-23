import { getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { adhdPrefsDoc, betaFeatureDoc } from "./paths";

/**
 * Whether this account may use a feature still being tried out. The rules
 * decide: a tester (or everyone, once it's opened up) can read the switch
 * document, even when it doesn't exist; anyone else is refused. Only a clear
 * refusal means no — offline or a hiccup returns `fallback`, so the last
 * known answer holds.
 */
export const hasBeta = async (feature, fallback = false) => {
  try {
    await getDoc(betaFeatureDoc(feature));
    return true;
  } catch (error) {
    return error?.code === "permission-denied" ? false : fallback;
  }
};

export const loadAdhdPrefs = async (uid) => {
  const snapshot = await getDoc(adhdPrefsDoc(uid));
  return snapshot.exists() ? snapshot.data() : null;
};

/** The whole document each time; a day is only written once picks have been made. */
export const saveAdhdPrefs = (uid, { enabled, day, picks }) =>
  setDoc(adhdPrefsDoc(uid), {
    enabled: Boolean(enabled),
    ...(day ? { day } : {}),
    picks: Array.isArray(picks) ? picks : [],
    updatedAt: serverTimestamp(),
  });
