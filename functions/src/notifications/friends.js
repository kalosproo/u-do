import { onDocumentCreated } from "firebase-functions/v2/firestore";

import { db } from "../firebaseAdmin.js";
import { sendToSubscription, subscriptionFor } from "./send.js";

/**
 * The event-driven half of reminders. These fire when something happens rather
 * than on the clock, so they ignore the user's chosen time and respect only
 * their `friends` switch.
 */

/** A person's own name for themselves, or something neutral. */
const nameOf = async (uid) => {
  const snapshot = await db.collection("profiles").doc(uid).get();
  if (!snapshot.exists) return "Someone";

  const data = snapshot.data();
  return data.displayName || (data.username ? `@${data.username}` : "Someone");
};

const wants = (subscription) => subscription && subscription.types?.friends !== false;

export const onFriendRequest = onDocumentCreated(
  "profiles/{uid}/requests/{fromUid}",
  async (event) => {
    const { uid, fromUid } = event.params;
    if (uid === fromUid) return;

    const subscription = await subscriptionFor(uid);
    if (!wants(subscription)) return;

    await sendToSubscription(subscription, {
      title: "New friend request",
      body: `${await nameOf(fromUid)} wants to be friends on U.Do.`,
      url: "/friends",
      tag: `udo-request-${fromUid}`,
    });
  },
);

/**
 * Fires on both halves of an accept, and deliberately so.
 *
 * acceptFriendRequest writes both sides and only then deletes the request, so
 * the request document is not a reliable way to tell the requester from the
 * accepter by the time a trigger reads it — the delete may already have landed.
 * Rather than send the wrong person the wrong message some of the time, both
 * sides get one, worded so it is true for either: the requester learns they
 * were accepted, and the accepter gets a confirmation of what they just did.
 */
export const onFriendAdded = onDocumentCreated(
  "profiles/{uid}/friends/{friendUid}",
  async (event) => {
    const { uid, friendUid } = event.params;
    if (uid === friendUid) return;

    const subscription = await subscriptionFor(uid);
    if (!wants(subscription)) return;

    await sendToSubscription(subscription, {
      title: "You're now friends",
      body: `You and ${await nameOf(friendUid)} can see each other's streaks.`,
      url: "/friends",
      tag: `udo-friend-${friendUid}`,
    });
  },
);
