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
    proPlanDoc,
    growthCounts,
  ] = await Promise.all([
    countOf(billing),
    countOf(billing.where("createdAt", ">=", todayStart)),
    countOf(billing.where("planId", "==", PLAN_IDS.FREE)),
    countOf(billing.where("planId", "==", PLAN_IDS.PRO)),
    countOf(db.collection("usageCounters").where("lastActiveAt", ">=", activeSince)),
    countOf(db.collection("subscriptions").where("status", "==", "active")),
    countOf(db.collection("subscriptions").where("status", "==", "pending")),
    countOf(db.collection("subscriptions").where("status", "==", "halted")),
    countOf(
      db.collection("payments")
        .where("status", "==", "failed")
        .where("createdAt", ">=", failedSince),
    ),
    db.collection("planLimits").doc(PLAN_IDS.PRO).get(),
    Promise.all(
      growthWindows.map((window) =>
        countOf(
          billing
            .where("createdAt", ">=", window.from)
            .where("createdAt", "<", window.to),
        ),
      ),
    ),
  ]);

  const proPrice = proPlanDoc.exists ? proPlanDoc.data().priceMinor : null;

  // MRR is only honest once Pro has a price. Until then it stays unsupported
  // rather than silently reporting zero revenue.
  const mrr =
    typeof proPrice === "number"
      ? supported({
          amountMinor: activeSubscriptions * proPrice,
          currency: proPlanDoc.data().currency || "INR",
        })
      : unsupported("Pro has no price set. Add one at planLimits/pro.priceMinor.");

  const conversion =
    totalUsers > 0
      ? supported(Number(((proUsers / totalUsers) * 100).toFixed(2)))
      : supported(0);

  return {
    generatedAt: Date.now(),
    users: {
      total: supported(totalUsers),
      activeLast7Days: supported(activeUsers),
      newToday: supported(newUsersToday),
      free: supported(freeUsers),
      pro: supported(proUsers),
    },
    subscriptions: {
      active: supported(activeSubscriptions),
      pending: supported(pendingSubscriptions),
      halted: supported(haltedSubscriptions),
    },
    payments: {
      failedLast24h: supported(failedPayments),
    },
    revenue: { mrr },
    conversionPercent: conversion,
    growth: supported(
      growthWindows.map((window, index) => ({
        date: window.date,
        signups: growthCounts[index],
      })),
    ),
  };
});
