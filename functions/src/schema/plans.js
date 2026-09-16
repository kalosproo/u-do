/**
 * The one place plan limits and pricing are defined.
 *
 * The admin app never hardcodes these. It reads `planLimits/{planId}` in
 * Firestore, which `seedPlanLimits` writes from this file. Change a number
 * here, redeploy, run the seed, and both the backend and the admin UI move
 * together.
 *
 * `null` in a limit means unlimited. `null` for priceMinor means the price
 * has not been decided yet — revenue maths must treat that as unknown rather
 * than as zero.
 */

export const PLAN_IDS = Object.freeze({
  FREE: "free",
  PRO: "pro",
});

export const PLANS = Object.freeze({
  [PLAN_IDS.FREE]: {
    planId: PLAN_IDS.FREE,
    label: "Free",
    priceMinor: 0,
    currency: "INR",
    interval: null,
    adsEnabled: true,
    limits: {
      tasksActive: 50,
      habits: 5,
      financeEntriesPerMonth: 30,
      plannerEventsPerMonth: 20,
      friends: 3,
      aiRequestsPerMonth: 5,
    },
  },
  [PLAN_IDS.PRO]: {
    planId: PLAN_IDS.PRO,
    label: "Pro",
    // Undecided. Set it in Firestore at planLimits/pro.priceMinor (paise) when
    // you pick a number, or change it here and re-seed.
    priceMinor: null,
    currency: "INR",
    interval: "monthly",
    adsEnabled: false,
    limits: {
      tasksActive: null,
      habits: null,
      financeEntriesPerMonth: null,
      plannerEventsPerMonth: null,
      friends: null,
      aiRequestsPerMonth: null,
    },
  },
});

/** Counter fields kept on usageCounters/{uid}. Monthly ones reset on rollover. */
export const USAGE_FIELDS = Object.freeze({
  monthly: ["financeEntriesPerMonth", "plannerEventsPerMonth", "aiRequestsPerMonth"],
  lifetime: ["tasksActive", "habits", "friends"],
});

export const DEFAULT_USAGE = Object.freeze({
  tasksActive: 0,
  habits: 0,
  friends: 0,
  financeEntriesPerMonth: 0,
  plannerEventsPerMonth: 0,
  aiRequestsPerMonth: 0,
});

/** Subscription states the admin Subscriptions view groups by. */
export const SUBSCRIPTION_STATUSES = Object.freeze([
  "active",
  "pending",
  "halted",
  "cancelled",
  "expired",
]);

export const PAYMENT_STATUSES = Object.freeze([
  "captured",
  "authorized",
  "failed",
  "refunded",
]);

export const getPlan = (planId) => PLANS[planId] || PLANS[PLAN_IDS.FREE];
