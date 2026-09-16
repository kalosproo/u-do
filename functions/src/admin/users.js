import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";

import { clampLimit, requireAdmin } from "./guard.js";
import { writeAccessLog } from "./audit.js";
import { DEFAULT_USAGE, PLAN_IDS } from "../schema/plans.js";


const toMillis = (value) =>
  value instanceof Timestamp ? value.toMillis() : null;

/** Everything an admin list row is allowed to show, and nothing more. */
const toUserRow = (uid, { billing = {}, profile = {}, usage = {} }) => ({
  uid,
  displayName: profile.displayName || null,
  username: profile.username || null,
  email: billing.email || null,
  planId: billing.planId || PLAN_IDS.FREE,
  subscriptionStatus: billing.subscriptionStatus || null,
  disabled: billing.disabled === true,
  createdAt: toMillis(billing.createdAt),
  lastActiveAt: toMillis(usage.lastActiveAt),
  usage: { ...DEFAULT_USAGE, ...(usage.counters || {}) },
});

const hydrate = async (uids) => {
  if (uids.length === 0) return new Map();

  const [profiles, usages] = await Promise.all([
    db.getAll(...uids.map((uid) => db.collection("profiles").doc(uid))),
    db.getAll(...uids.map((uid) => db.collection("usageCounters").doc(uid))),
  ]);

  const map = new Map();
  uids.forEach((uid, index) => {
    map.set(uid, {
      profile: profiles[index].exists ? profiles[index].data() : {},
      usage: usages[index].exists ? usages[index].data() : {},
    });
  });
  return map;
};

/**
 * A page of users, newest first.
 *
 * Paging is by createdAt cursor rather than offset, so page 40 costs the same
 * as page 1 and the whole collection is never read. The page size is clamped
 * server-side, so a crafted request cannot ask for everything.
 */
export const listAdminUsers = onCall(async (request) => {
  requireAdmin(request);

  const { cursor = null, limit } = request.data || {};
  const pageSize = clampLimit(limit);

  let query = db.collection("billing").orderBy("createdAt", "desc").limit(pageSize);

  if (cursor) {
    query = query.startAfter(Timestamp.fromMillis(cursor));
  }

  const snap = await query.get();
  const uids = snap.docs.map((doc) => doc.id);
  const extra = await hydrate(uids);

  const users = snap.docs.map((doc) =>
    toUserRow(doc.id, { billing: doc.data(), ...extra.get(doc.id) }),
  );

  const last = snap.docs.at(-1);

  return {
    users,
    nextCursor: snap.size === pageSize && last ? toMillis(last.data().createdAt) : null,
  };
});

/**
 * Find one account by email or UID. Kept separate from the list so that search
 * is a direct lookup instead of a scan.
 */
export const findAdminUser = onCall(async (request) => {
  requireAdmin(request);

  const term = String(request.data?.term || "").trim();
  if (!term) {
    throw new HttpsError("invalid-argument", "Enter an email address or UID.");
  }

  const auth = getAuth();
  const record = term.includes("@")
    ? await auth.getUserByEmail(term).catch(() => null)
    : await auth.getUser(term).catch(() => null);

  if (!record) return { users: [], nextCursor: null };

  const billingDoc = await db.collection("billing").doc(record.uid).get();
  const extra = await hydrate([record.uid]);

  return {
    users: [
      toUserRow(record.uid, {
        billing: billingDoc.exists
          ? billingDoc.data()
          : { email: record.email, planId: PLAN_IDS.FREE },
        ...extra.get(record.uid),
      }),
    ],
    nextCursor: null,
  };
});

/**
 * One account in detail.
 *
 * Deliberately returns counts and status only. Task titles, expense rows,
 * friend messages and AI prompts stay in users/{uid}, which no admin path
 * reads — an operator can see that someone used 12 of 30 finance entries, not
 * what any of them were.
 */
export const getAdminUserDetail = onCall(async (request) => {
  const admin = requireAdmin(request);
  const uid = String(request.data?.uid || "").trim();

  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  const auth = getAuth();
  const [record, billingDoc, profileDoc, usageDoc, subsSnap, paymentsSnap, friendsCount] =
    await Promise.all([
      auth.getUser(uid).catch(() => null),
      db.collection("billing").doc(uid).get(),
      db.collection("profiles").doc(uid).get(),
      db.collection("usageCounters").doc(uid).get(),
      db.collection("subscriptions").where("uid", "==", uid)
        .orderBy("createdAt", "desc").limit(10).get(),
      db.collection("payments").where("uid", "==", uid)
        .orderBy("createdAt", "desc").limit(10).get(),
      db.collection("profiles").doc(uid).collection("friends").count().get(),
    ]);

  if (!record) {
    throw new HttpsError("not-found", "No account with that UID.");
  }

  await writeAccessLog(db, { admin, targetUid: uid, surface: "user-detail" });

  const usage = usageDoc.exists ? usageDoc.data() : {};

  return {
    account: {
      uid,
      email: record.email || null,
      displayName: record.displayName || profileDoc.data()?.displayName || null,
      disabled: record.disabled,
      createdAt: Date.parse(record.metadata.creationTime) || null,
      lastSignInAt: Date.parse(record.metadata.lastSignInTime) || null,
      providers: record.providerData.map((provider) => provider.providerId),
    },
    billing: billingDoc.exists ? {
      planId: billingDoc.data().planId,
      subscriptionStatus: billingDoc.data().subscriptionStatus || null,
      currentPeriodEnd: toMillis(billingDoc.data().currentPeriodEnd),
      grantedProUntil: toMillis(billingDoc.data().grantedProUntil),
    } : null,
    usage: {
      counters: { ...DEFAULT_USAGE, ...(usage.counters || {}) },
      lastActiveAt: toMillis(usage.lastActiveAt),
      monthKey: usage.monthKey || null,
    },
    friendsCount: friendsCount.data().count,
    subscriptions: subsSnap.docs.map((doc) => ({
      id: doc.id,
      status: doc.data().status,
      provider: doc.data().provider,
      planId: doc.data().planId,
      currentStart: toMillis(doc.data().currentStart),
      currentEnd: toMillis(doc.data().currentEnd),
      createdAt: toMillis(doc.data().createdAt),
    })),
    payments: paymentsSnap.docs.map((doc) => ({
      id: doc.id,
      status: doc.data().status,
      amountMinor: doc.data().amountMinor,
      currency: doc.data().currency,
      method: doc.data().method || null,
      createdAt: toMillis(doc.data().createdAt),
    })),
  };
});
