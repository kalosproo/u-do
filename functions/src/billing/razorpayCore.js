import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The pure half of payments: signature checks and what each Razorpay event
 * means for an account. No network and no Admin SDK, so all of it is
 * testable. razorpay.js does the I/O around it.
 */

/**
 * Razorpay signs every webhook body with HMAC-SHA256 under the webhook
 * secret. Anything that fails this is not from Razorpay and is ignored.
 * Compared in constant time so the comparison itself leaks nothing.
 */
export const verifySignature = (rawBody, signature, secret) => {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Razorpay's subscription states, folded into the five the console groups by. */
const STATUS = {
  created: "pending",
  authenticated: "pending",
  pending: "pending",
  active: "active",
  halted: "halted",
  cancelled: "cancelled",
  completed: "expired",
  expired: "expired",
  paused: "halted",
};

export const subscriptionStatus = (raw) => STATUS[raw] || "pending";

/**
 * Only an active subscription makes an account Pro. A halted one — the
 * card failed every retry — drops back to Free, and so does a cancelled or
 * finished one: Razorpay sends "cancelled" when the subscription actually
 * ends, not when someone asks to cancel at the end of the period.
 */
export const planFor = (status) => (status === "active" ? "pro" : "free");

const seconds = (value) => (Number.isFinite(value) && value > 0 ? value * 1000 : null);

/**
 * What a webhook event changes, as plain data: the subscription record, the
 * account's plan, a payment row and an activity event. Null pieces mean
 * "leave alone". Events this app does not act on return null.
 */
export const interpret = (event) => {
  const type = event?.event;
  const sub = event?.payload?.subscription?.entity;
  const pay = event?.payload?.payment?.entity;

  const uid = sub?.notes?.uid || pay?.notes?.uid || null;

  const payment = pay
    ? {
        id: pay.id,
        uid,
        status: pay.status === "captured" ? "captured" : pay.status === "failed" ? "failed" : pay.status || "authorized",
        amountMinor: Number.isSafeInteger(pay.amount) ? pay.amount : null,
        currency: pay.currency || "INR",
        subscriptionId: sub?.id || pay.subscription_id || null,
        provider: "razorpay",
        createdAtMs: seconds(pay.created_at),
      }
    : null;

  if (type?.startsWith("subscription.") && sub?.id) {
    const status = subscriptionStatus(sub.status);
    return {
      uid,
      subscription: {
        id: sub.id,
        uid,
        status,
        provider: "razorpay",
        planId: "pro",
        currentPeriodEndMs: seconds(sub.current_end),
      },
      billing: uid ? { planId: planFor(status), subscriptionStatus: status, subscriptionId: sub.id } : null,
      payment,
      activity: status === "active" && type === "subscription.activated" ? "pro_started"
        : planFor(status) === "free" && ["subscription.halted", "subscription.cancelled", "subscription.completed"].includes(type) ? "pro_ended"
        : null,
    };
  }

  if (type === "payment.failed" || type === "payment.captured") {
    return { uid, subscription: null, billing: null, payment, activity: null };
  }

  return null;
};
