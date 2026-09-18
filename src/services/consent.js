import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "./firebase";
import { PRIVACY_POLICY_VERSION } from "../utils/consent";

const consentDoc = (uid) => doc(db, "consents", uid);

/**
 * Records that this account accepted the current policy version.
 *
 * Written by the client, because consent is a thing a person does in a browser
 * and there is no server round trip at signup to carry it. The record is only
 * ever about the account writing it — the rules refuse anything else — so the
 * worst a forged one can do is misstate that account's own agreement.
 */
export const recordConsent = (uid, source = "signup") =>
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

/** Null when nothing has been recorded, or when the read is refused. */
export const fetchConsent = async (uid) => {
  if (!uid) return null;

  try {
    const snapshot = await getDoc(consentDoc(uid));
    return snapshot.exists() ? snapshot.data() : null;
  } catch {
    // A failed read must not lock anyone out of the app. Treating it as
    // "unknown" shows the prompt again, which is the safe direction.
    return null;
  }
};
