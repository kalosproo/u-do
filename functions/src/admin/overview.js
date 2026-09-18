import { Timestamp } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";

import { requireAdmin } from "./guard.js";
import { PLAN_IDS } from "../schema/plans.js";


// Every "today" and "this month" boundary is India time, so the numbers match
// the clock on the wall rather than UTC.
const TZ_OFFSET_MINUTES = 330;
const ACTIVE_WINDOW_DAYS = 7;
const GROWTH_DAYS = 14;

const shiftedNow = () => new Date(Date.now() + TZ_OFFSET_MINUTES * 60_000);

/** Start of a local day, expressed as a real (UTC) instant for querying. */
const startOfLocalDay = (daysAgo = 0) => {
  const local = shiftedNow();
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - daysAgo);
  return new Date(local.getTime() - TZ_OFFSET_MINUTES * 60_000);
};

const localDateKey = (daysAgo = 0) => {
  const local = shiftedNow();
  local.setUTCDate(local.getUTCDate() - daysAgo);
  return local.toISOString().slice(0, 10);
};

const countOf = async (query) => {
  const snap = await query.count().get();
  return snap.data().count;
};

/** A metric the UI can render truthfully, including when it cannot be computed. */
const supported = (value) => ({ supported: true, value });
const unsupported = (reason) => ({ supported: false, value: null, reason });

/**
 * Turns a thrown query into something an operator can act on.
 *
 * A missing composite index is by far the most common of these and the only
 * one with a one-line fix, so it says the command rather than the error.
 */
const reasonFor = (error, label) => {
  const code = error?.code;
  const message = String(error?.message || "");

  if (code === 9 || code === "failed-precondition") {
    if (/index/i.test(message)) {
      return "Needs a Firestore index. Run: firebase deploy --only firestore:indexes";
    }
    return `Could not compute ${label}: ${message}`;
  }

  if (code === 7 || code === "permission-denied") {
    return `The server was refused access while computing ${label}.`;
  }

  return `Could not compute ${label}.`;
};

/**
 * Runs one figure's query in isolation.
 *
 * Every figure used to share a single Promise.all, which meant one rejected
 * query — a collection with no index, a collection that does not exist yet —
 * took down all nine and left the console reading "Not loaded" across the
 * board. The supported/unsupported shape was built to carry exactly this, so
 * each figure now fails on its own and the rest of the page still reports.
 */
const attempt = async (label, run) => {
  try {
    return supported(await run());
  } catch (error) {
    console.error(`getAdminOverview: ${label} failed`, error);
    return unsupported(reasonFor(error, label));
  }
};

/**
 * Overview figures.
 *
 * Every number here is a Firestore count() aggregation, which is billed and
 * measured on the index rather than on documents — so this stays cheap as the
 * user base grows and never pulls collections into memory. The browser is not
 * asked to scan anything.
 */
export const getAdminOverview = onCall(async (request) => {
  requireAdmin(request);

  const billing = db.collection("billing");
  const todayStart = Timestamp.fromDate(startOfLocalDay(0));
  const activeSince = Timestamp.fromDate(startOfLocalDay(ACTIVE_WINDOW_DAYS));
  const failedSince = Timestamp.fromDate(startOfLocalDay(1));

  const growthWindows = Array.from({ length: GROWTH_DAYS }, (_, index) => {
    const offset = GROWTH_DAYS - 1 - index;
    return {
      date: localDateKey(offset),
      from: Timestamp.fromDate(startOfLocalDay(offset)),
      to: Timestamp.fromDate(startOfLocalDay(offset - 1)),
    };
  });

  const [
    totalUsers,
    newUsersToday,
    freeUsers,
    proUsers,
    activeUsers,
    activeSubscriptions,
    pendingSubscriptions,
    haltedSubscriptions,
    failedPayments,
    proPlan,
    growth,
  ] = await Promise.all([
    attempt("total users", () => countOf(billing)),
    attempt("new users today", () => countOf(billing.where("createdAt", ">=", todayStart))),
    attempt("Free users", () => countOf(billing.where("planId", "==", PLAN_IDS.FREE))),
    attempt("Pro users", () => countOf(billing.where("planId", "==", PLAN_IDS.PRO))),
    attempt("active users", () =>
      countOf(db.collection("usageCounters").where("lastActiveAt", ">=", activeSince)),
    ),
    attempt("active subscriptions", () =>
      countOf(db.collection("subscriptions").where("status", "==", "active")),
    ),
    attempt("pending subscriptions", () =>
      countOf(db.collection("subscriptions").where("status", "==", "pending")),
    ),
    attempt("halted subscriptions", () =>
      countOf(db.collection("subscriptions").where("status", "==", "halted")),
    ),
    attempt("failed payments", () =>
      countOf(
        db.collection("payments")
          .where("status", "==", "failed")
          .where("createdAt", ">=", failedSince),
      ),
    ),
    attempt("the Pro plan", async () => {
      const doc = await db.collection("planLimits").doc(PLAN_IDS.PRO).get();
      return doc.exists ? doc.data() : null;
    }),
    attempt("signup growth", async () => {
      const counts = await Promise.all(
        growthWindows.map((window) =>
          countOf(
            billing
              .where("createdAt", ">=", window.from)
              .where("createdAt", "<", window.to),
          ),
        ),
      );
      return growthWindows.map((window, index) => ({
        date: window.date,
        signups: counts[index],
      }));
    }),
  ]);

  return {
    generatedAt: Date.now(),
    users: {
      total: totalUsers,
      activeLast7Days: activeUsers,
      newToday: newUsersToday,
      free: freeUsers,
      pro: proUsers,
    },
    subscriptions: {
      active: activeSubscriptions,
      pending: pendingSubscriptions,
      halted: haltedSubscriptions,
    },
    payments: {
      failedLast24h: failedPayments,
    },
    revenue: { mrr: deriveMrr(activeSubscriptions, proPlan) },
    conversionPercent: deriveConversion(proUsers, totalUsers),
    growth,
  };
});

/**
 * MRR is only honest once Pro has a price and the subscription count is real.
 * Either one missing leaves it unsupported rather than reporting zero revenue,
 * which reads as "we earned nothing" instead of "we cannot tell yet".
 */
function deriveMrr(activeSubscriptions, proPlan) {
  if (!activeSubscriptions.supported) {
    return unsupported("Active subscriptions could not be counted, so MRR cannot be derived.");
  }
  if (!proPlan.supported) return unsupported(proPlan.reason);

  const price = proPlan.value?.priceMinor;

  if (typeof price !== "number") {
    return unsupported("Pro has no price set. Add one at planLimits/pro.priceMinor.");
  }

  return supported({
    amountMinor: activeSubscriptions.value * price,
    currency: proPlan.value.currency || "INR",
  });
}

function deriveConversion(proUsers, totalUsers) {
  if (!proUsers.supported || !totalUsers.supported) {
    return unsupported("Needs both the Pro and total user counts.");
  }
  if (totalUsers.value === 0) return supported(0);

  return supported(Number(((proUsers.value / totalUsers.value) * 100).toFixed(2)));
}
