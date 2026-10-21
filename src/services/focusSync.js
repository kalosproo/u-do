import { getDoc, getDocs, increment, query, serverTimestamp, setDoc, where } from "firebase/firestore";

import { focusCollection, focusDayDoc, focusPresenceDoc } from "./paths";

/**
 * The focus timer's account-side half: each finished stretch adds to that
 * day's record, so focus time follows the person across devices, and a small
 * "studying now" note friends can see.
 */

const MAX_SUBJECT = 40;

const cleanSubject = (subject) => String(subject || "").trim().slice(0, MAX_SUBJECT);

/** Adds one finished stretch to the day's record. Never throws. */
export const recordFocus = async (uid, { dateKey, minutes, subject }) => {
  if (!uid || !(minutes >= 1)) return false;
  const whole = Math.round(minutes);
  const name = cleanSubject(subject);
  const base = {
    date: dateKey,
    minutes: increment(whole),
    sessions: increment(1),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(focusDayDoc(uid, dateKey), name ? { ...base, subjects: { [name]: increment(whole) } } : base, { merge: true });
    return true;
  } catch {
    // The rules cap a day at 30 subjects; past that the time still counts.
    try {
      await setDoc(focusDayDoc(uid, dateKey), base, { merge: true });
      return true;
    } catch {
      return false;
    }
  }
};

/** Days on or after `sinceKey`, as { [dateKey]: { minutes, sessions, subjects } }. */
export const loadFocusDays = async (uid, sinceKey) => {
  const snapshot = await getDocs(query(focusCollection(uid), where("date", ">=", sinceKey)));
  const days = {};
  snapshot.forEach((item) => {
    const data = item.data();
    days[item.id] = {
      minutes: Number(data.minutes) || 0,
      sessions: Number(data.sessions) || 0,
      subjects: data.subjects || {},
    };
  });
  return days;
};

/**
 * Publishes whether this person is focusing right now. Only the state and
 * when it ends — never what they're studying. Friends read it next to the
 * habit summary; an old note simply expires once its end time has passed.
 */
export const publishPresence = async (uid, session) => {
  if (!uid) return;
  const focusing = Boolean(session && session.phase === "focus" && !session.paused);
  try {
    await setDoc(focusPresenceDoc(uid), {
      focusing,
      endsAt: focusing ? session.endsAt : null,
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* Presence is a nicety; a failed write changes nothing for the person. */
  }
};

/** A friend's "studying now", or null when they aren't (or it has expired). */
export const readPresence = async (friendUid, now = Date.now()) => {
  try {
    const snapshot = await getDoc(focusPresenceDoc(friendUid));
    const data = snapshot.exists() ? snapshot.data() : null;
    if (!data?.focusing || !(data.endsAt > now)) return null;
    return { endsAt: data.endsAt };
  } catch {
    return null;
  }
};

/**
 * Moves focus time kept on this device before sign-in (or before syncing
 * existed) into the account, once. Adds to whatever the account already has.
 */
export const importLocalDays = async (uid, log) => {
  const entries = Object.entries(log || {}).filter(([key, day]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && day?.minutes >= 1);
  for (const [dateKey, day] of entries) {
    await setDoc(
      focusDayDoc(uid, dateKey),
      {
        date: dateKey,
        minutes: increment(Math.min(1440, Math.round(day.minutes))),
        sessions: increment(Math.min(200, Math.max(1, day.sessions || 1))),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  return entries.length;
};
