import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "./firebase";
import { PRIVACY_POLICY_VERSION } from "../utils/consent";

const consentDoc = (uid) => doc(db, "consents", uid);
const localKey = (uid) => `u_do_consent_${uid}`;

/**
 * Acceptance is remembered on the device as well as on the server.
 *
 * Not as a cache — as a safety net. The person accepting is the part that
 * matters and it has already happened by the time we try to write; whether our
 * backend manages to record it is our problem, not theirs. Without this, a
 * refused write (rules not deployed yet, a dropped connection, a quota) leaves
 * someone staring at a dialog they cannot dismiss, locked out of their own
 * tasks by a consent prompt they already agreed to.
 */
const rememberLocally = (uid) => {
  try {
    localStorage.setItem(
      localKey(uid),
      JSON.stringify({ privacyVersion: PRIVACY_POLICY_VERSION, at: Date.now() }),
    );
  } catch {
    /* Private mode, blocked storage. The server write may still land. */
  }
};

const readLocally = (uid) => {
  try {
    const raw = localStorage.getItem(localKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Names what actually went wrong, rather than guessing at the network. */
const reasonFor = (error) => {
  if (error?.code === "permission-denied") return "permission-denied";
  if (error?.code === "unavailable") return "offline";
  return "unknown";
};

const write = (uid, source) =>
  setDoc(
    consentDoc(uid),
    {
      uid,
      privacyVersion: PRIVACY_POLICY_VERSION,
      acceptedAt: serverTimestamp(),
      source,
    },
    { merge: true },
  );

/**
 * Records that this account accepted the current policy version.
 *
 * Written by the client, because consent is a thing a person does in a browser
 * and there is no server round trip at signup to carry it. The record is only
 * ever about the account writing it — the rules refuse anything else — so the
 * worst a forged one can do is misstate that account's own agreement.
 *
 * Never throws. It reports whether the server took it, and the device
 * remembers either way, so the caller can let the person through and the sync
 * can be retried later.
 */
export const recordConsent = async (uid, source = "signup") => {
  rememberLocally(uid);

  try {
    await write(uid, source);
    return { stored: true, synced: true };
  } catch (error) {
    console.error("recordConsent: could not reach the server", error);
    return { stored: true, synced: false, reason: reasonFor(error) };
  }
};

/**
 * The server's record, or the device's if the server has none.
 *
 * A local record is returned marked pending so the caller knows the sync is
 * still owed — but it counts as consent, because it is: the person accepted.
 */
export const fetchConsent = async (uid) => {
  if (!uid) return null;

  try {
    const snapshot = await getDoc(consentDoc(uid));
    if (snapshot.exists()) return snapshot.data();
  } catch (error) {
    console.error("fetchConsent: could not read the server record", error);
  }

  const local = readLocally(uid);
  return local ? { ...local, uid, pending: true } : null;
};

/**
 * Retries a write the server refused earlier. Called on load, so a consent
 * given while the rules were still undeployed lands on its own once they are,
 * with nobody asked to accept twice.
 */
export const syncPendingConsent = async (uid, record) => {
  if (!uid || !record?.pending) return false;

  try {
    await write(uid, "retry");
    return true;
  } catch {
    return false;
  }
};
