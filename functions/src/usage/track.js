import * as functionsV1 from "firebase-functions/v1";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../firebaseAdmin.js";
import { DEFAULT_USAGE, PLAN_IDS } from "../schema/plans.js";
import { COUNTER_FOR, eventTypeFor, monthKeyFor, monthRange } from "./counters.js";
import { logServerError } from "../errors/report.js";

/**
 * Keeps the numbers the admin console shows real.
 *
 * The console has always read billing, usageCounters and activityEvents, and
 * the rules have always made them server-write-only — but nothing on the
 * server ever wrote them. New accounts got no billing record, so they were
 * invisible to every user count; usage stayed at zero; the activity feed was
 * permanently empty. These triggers are the missing writers.
 *
 * Counters are recounted rather than incremented. Triggers are delivered at
 * least once, and an increment that runs twice is wrong forever; a recount
 * that runs twice is merely right twice. It also heals any drift on the next
 * write instead of needing a repair job.
 */

const usageRef = (uid) => db.collection("usageCounters").doc(uid);

const countOf = async (query) => (await query.count().get()).data().count;

const recount = async (uid, collection, monthKey) => {
  const spec = COUNTER_FOR[collection];
  if (!spec) return null;

  const base = db.collection("users").doc(uid).collection(collection);

  if (collection === "tasks") {
    const [total, done] = await Promise.all([
      countOf(base),
      countOf(base.where("completed", "==", true)),
    ]);
    return { [spec.field]: Math.max(0, total - done) };
  }

  if (spec.monthly) {
    const { from, to } = monthRange(monthKey);
    return { [spec.field]: await countOf(base.where("date", ">=", from).where("date", "<=", to)) };
  }

  return { [spec.field]: await countOf(base) };
};

/**
 * Writes usage only while the account still has a billing record.
 *
 * Deleting an account removes its workspace first, and every one of those
 * deletes fires the trigger below. Without this check those late triggers
 * would recreate a usage record for a person who no longer exists. Reading
 * billing inside the same transaction closes the race: if the delete removes
 * billing between our read and our write, the transaction retries and sees it
 * gone.
 */
const writeUsage = (uid, data) =>
  db.runTransaction(async (transaction) => {
    const billing = await transaction.get(db.collection("billing").doc(uid));
    if (!billing.exists) return false;
    transaction.set(usageRef(uid), data, { merge: true });
    return true;
  });

export const recordActivity = (type, uid) =>
  db.collection("activityEvents").add({
    type,
    uid: uid || null,
    createdAt: FieldValue.serverTimestamp(),
  });

/**
 * Any change to someone's workspace: refresh the counter it feeds, mark them
 * active, and log what kind of thing happened.
 *
 * A failure here must never surface to the person — their write has already
 * succeeded — so it is logged and swallowed.
 */
export const onWorkspaceWrite = onDocumentWritten(
  "users/{uid}/{collection}/{docId}",
  async (event) => {
    const { uid, collection } = event.params;
    if (!COUNTER_FOR[collection]) return;

    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const monthKey = monthKeyFor();

    try {
      const counters = await recount(uid, collection, monthKey);

      const live = await writeUsage(uid, {
        uid,
        monthKey,
        counters,
        lastActiveAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const type = eventTypeFor(collection, before, after);
      if (live && type) await recordActivity(type, uid);
    } catch (error) {
      console.error("onWorkspaceWrite failed", { uid, collection, error });
      await logServerError("onWorkspaceWrite", error, "error");
    }
  },
);

/** Friends live under profiles, not the workspace, so they get their own trigger. */
const countConnections = async (uid) => {
  const profile = db.collection("profiles").doc(uid);
  const [friends, following] = await Promise.all([countOf(profile.collection("friends")), countOf(profile.collection("following"))]);
  return friends + following;
};

export const onFriendsChanged = onDocumentWritten(
  "profiles/{uid}/friends/{friendUid}",
  async (event) => {
    const { uid } = event.params;

    try {
      const friends = await countConnections(uid);
      const live = await writeUsage(uid, {
        uid,
        counters: { friends },
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (live && !event.data?.before?.exists && event.data?.after?.exists) {
        await recordActivity("friend_added", uid);
      }
    } catch (error) {
      console.error("onFriendsChanged failed", { uid, error });
      await logServerError("onFriendsChanged", error, "error");
    }
  },
);

/** Following counts toward the same "friends" figure the console shows. */
export const onFollowingChanged = onDocumentWritten(
  "profiles/{uid}/following/{targetUid}",
  async (event) => {
    const { uid } = event.params;
    try {
      await writeUsage(uid, { uid, counters: { friends: await countConnections(uid) }, updatedAt: FieldValue.serverTimestamp() });
    } catch (error) {
      console.error("onFollowingChanged failed", { uid, error });
      await logServerError("onFollowingChanged", error, "error");
    }
  },
);

/**
 * Every new account gets the billing and usage records the console counts.
 *
 * Before this, only accounts that existed when backfillBilling was last run
 * were visible at all, so "total users" and "new today" stopped at the day
 * someone last remembered to press it. A record that already exists is left
 * alone, so this and the backfill can never fight.
 *
 * This is the v1 Auth trigger on purpose. The v2 equivalent is a blocking
 * function, which needs Identity Platform and can stop a signup if it fails;
 * this one runs after the account exists and cannot.
 */
export const onUserCreated = functionsV1.auth.user().onCreate(async (user) => {
  const billing = db.collection("billing").doc(user.uid);

  try {
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(billing);
      if (existing.exists) return;

      const createdAt = user.metadata?.creationTime
        ? Timestamp.fromDate(new Date(user.metadata.creationTime))
        : FieldValue.serverTimestamp();

      transaction.set(billing, {
        uid: user.uid,
        email: user.email || null,
        planId: PLAN_IDS.FREE,
        subscriptionStatus: null,
        subscriptionId: null,
        provider: null,
        disabled: user.disabled === true,
        currentPeriodEnd: null,
        grantedProUntil: null,
        createdAt,
        updatedAt: FieldValue.serverTimestamp(),
        source: "signup",
      });

      transaction.set(
        usageRef(user.uid),
        {
          uid: user.uid,
          counters: DEFAULT_USAGE,
          monthKey: monthKeyFor(),
          lastActiveAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    await recordActivity("signup", user.uid);
  } catch (error) {
    console.error("onUserCreated failed", { uid: user.uid, error });
    await logServerError("onUserCreated", error);
  }
});
