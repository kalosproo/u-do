import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

import { db } from "../firebaseAdmin.js";

/**
 * Delivery, and the bookkeeping that keeps it working.
 *
 * Push tokens rot: a browser is cleared, an app is uninstalled, a token is
 * refreshed. FCM reports each dead one per-token rather than failing the send,
 * so every send prunes what it learns. Without that, a token from a phone
 * someone stopped using is retried forever, and the failure count in the
 * console makes a healthy system look broken.
 *
 * Messages are data-only. A payload carrying a `notification` block is
 * rendered by the browser *and* handed to the service worker, so anything the
 * worker draws would appear twice.
 */

const DEAD = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export const sendToSubscription = async (subscription, { title, body, url = "/", tag }) => {
  const tokens = Object.keys(subscription.tokens || {}).filter(
    (token) => subscription.tokens[token],
  );

  if (tokens.length === 0) return { sent: 0, pruned: 0 };

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: {
      title,
      body,
      url,
      ...(tag ? { tag } : {}),
    },
    webpush: {
      // Held by FCM for four hours. A reminder that arrives the next morning is
      // worse than one that never arrives.
      headers: { TTL: "14400", Urgency: "normal" },
      fcmOptions: { link: url },
    },
  });

  const dead = [];
  response.responses.forEach((result, index) => {
    if (!result.success && DEAD.has(result.error?.code)) dead.push(tokens[index]);
  });

  if (dead.length > 0) {
    const patch = {};
    dead.forEach((token) => {
      patch[`tokens.${token}`] = FieldValue.delete();
    });
    await db.collection("pushSubscriptions").doc(subscription.uid).update(patch);
  }

  return { sent: response.successCount, pruned: dead.length };
};

/** The subscription for one account, or null when they have never enabled push. */
export const subscriptionFor = async (uid) => {
  const snapshot = await db.collection("pushSubscriptions").doc(uid).get();
  if (!snapshot.exists) return null;

  const data = { uid, ...snapshot.data() };
  return data.enabled === true ? data : null;
};
