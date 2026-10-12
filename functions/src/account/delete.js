import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";

/**
 * Deleting an account, for real.
 *
 * The privacy policy told people to email us because no button existed. This
 * is that button, and it does what the policy says: the account and everything
 * attached to it.
 *
 * Doing this from the client was never an option. Half of what has to go is
 * unreachable by the person who owns it — the entry in someone else's friends
 * list, the username reservation, the billing record the rules make
 * server-write-only — so a client-side "delete" would leave the account gone
 * and its traces scattered across other people's data.
 *
 * Order matters. Firestore is emptied before the Auth record, because if the
 * Auth record goes first the caller's uid is the only handle on the rest and
 * a failure halfway leaves orphans nobody can find. Deleting data first and
 * failing means a retry finishes the job; the reverse means it never can.
 */

/** Sensitive enough to require the sign-in to be recent, not merely valid. */
const REAUTH_WINDOW_SECONDS = 5 * 60;

/** Workspace subcollections, mirroring WORKSPACE_COLLECTIONS in the app. */
const WORKSPACE = ["tasks", "planner", "expenses", "habits"];

/** Top-level documents keyed by the account's own uid. */
const OWNED_DOCS = [
  "billing",
  "consents",
  "pushSubscriptions",
  "usageCounters",
  "aiUsage",
];

/** Subcollections hanging off the person's public profile. */
const PROFILE_SUBS = ["shared", "requests", "outgoing", "friends"];

const deleteAll = async (query) => {
  const snap = await query.get();
  if (snap.empty) return 0;

  // Batches cap at 500 writes.
  for (let index = 0; index < snap.docs.length; index += 400) {
    const batch = db.batch();
    snap.docs.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  return snap.size;
};

/**
 * Removes this person from everyone else's lists.
 *
 * The friendship is recorded on both sides, and a request or an outgoing
 * marker lives on the other account entirely. Skipping this is what leaves a
 * deleted person showing up in a friend list forever, with a profile lookup
 * that resolves to nothing.
 */
const detachFromOthers = async (uid) => {
  const removed = { friends: 0, requests: 0, outgoing: 0 };

  // The friendship is written on both sides, so the other half is found by
  // reading my own list and deleting the mirror of each entry.
  const friends = await db.collection("profiles").doc(uid).collection("friends").get();

  for (const entry of friends.docs) {
    await db.collection("profiles").doc(entry.id).collection("friends").doc(uid).delete()
      .then(() => { removed.friends += 1; })
      .catch(() => {});
  }

  // A pending request or marker can sit on an account that never became a
  // friend, so the friend list does not find those. Both documents carry the
  // other party's uid as a field, which makes this two indexed collection-group
  // queries rather than a scan of every profile in the database.
  //
  //   profiles/{recipient}/requests/{me}  data.uid === me   — requests I sent
  //   profiles/{sender}/outgoing/{me}     data.uid === me   — markers about me
  //
  // The request document also carries a copy of my display name and photo, so
  // leaving these behind would keep a deleted person visible in someone's
  // pending list indefinitely.
  for (const name of ["requests", "outgoing"]) {
    const snap = await db.collectionGroup(name).where("uid", "==", uid).get();

    for (const doc of snap.docs) {
      await doc.ref.delete().then(() => { removed[name] += 1; }).catch(() => {});
    }
  }

  return removed;
};

/** The handle and invite code reservations, which are keyed by their value. */
const releaseReservations = async (uid) => {
  const released = { usernames: 0, inviteCodes: 0 };

  for (const name of ["usernames", "inviteCodes"]) {
    const snap = await db.collection(name).where("uid", "==", uid).get();
    for (const doc of snap.docs) {
      await doc.ref.delete().then(() => { released[name] += 1; }).catch(() => {});
    }
  }

  return released;
};

export const deleteMyAccount = onCall({ timeoutSeconds: 300 }, async (request) => {
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  // auth_time is when the credential was actually presented, not when the
  // token was minted, so a refreshed token does not pass this. Requiring a
  // fresh sign-in is what stops a borrowed unlocked laptop deleting somebody's
  // account with two clicks.
  const authTime = Number(auth.token?.auth_time || 0);
  const age = Math.floor(Date.now() / 1000) - authTime;

  if (!authTime || age > REAUTH_WINDOW_SECONDS) {
    throw new HttpsError(
      "failed-precondition",
      "Please sign in again before deleting your account.",
    );
  }

  const uid = auth.uid;
  const removed = {};

  try {
    for (const name of WORKSPACE) {
      removed[name] = await deleteAll(db.collection("users").doc(uid).collection(name));
    }

    for (const name of PROFILE_SUBS) {
      removed[`profile.${name}`] = await deleteAll(
        db.collection("profiles").doc(uid).collection(name),
      );
    }

    Object.assign(removed, await detachFromOthers(uid));
    Object.assign(removed, await releaseReservations(uid));

    await db.collection("profiles").doc(uid).delete().catch(() => {});

    for (const name of OWNED_DOCS) {
      await db.collection(name).doc(uid).delete().catch(() => {});
    }

    // Last, and only once the data is gone.
    await getAuth().deleteUser(uid);
  } catch (error) {
    console.error(`deleteMyAccount: ${uid} failed`, error);
    throw new HttpsError(
      "internal",
      "Your account could not be fully deleted. Nothing was left half-done that we can see — try again, or email us.",
    );
  }

  console.log(`deleteMyAccount: ${uid} deleted`, removed);
  return { ok: true };
});
