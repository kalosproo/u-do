import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";
import { sendToSubscription } from "./send.js";

/** One test every 30 seconds per account is plenty to debug with. */
const COOLDOWN_MS = 30_000;

/**
 * Pushes "this is a test" to every device the account has registered, now,
 * ignoring the reminder window. It answers the question the Reminders card
 * cannot answer on its own: does a notification actually reach this phone?
 *
 * Reports how many devices it reached and how many dead tokens it pruned,
 * so the card can say "sent to 1 device" or "no devices registered".
 */
export const sendTestPush = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const ref = db.collection("pushSubscriptions").doc(request.auth.uid);
  const snapshot = await ref.get();
  const subscription = snapshot.exists ? { uid: request.auth.uid, ...snapshot.data() } : null;

  if (!subscription) return { sent: 0, pruned: 0, devices: 0 };

  const last = subscription.lastTestAt?.toMillis?.() || 0;
  if (Date.now() - last < COOLDOWN_MS) {
    throw new HttpsError("resource-exhausted", "Wait a few seconds before sending another test.");
  }
  await ref.set({ lastTestAt: FieldValue.serverTimestamp() }, { merge: true });

  const devices = Object.values(subscription.tokens || {}).filter(Boolean).length;
  const result = await sendToSubscription(subscription, {
    title: "U.Do reminders work",
    body: "This is a test. Real reminders arrive inside the window you set.",
    url: "/profile",
    tag: "udo-test",
  });

  return { ...result, devices };
});
