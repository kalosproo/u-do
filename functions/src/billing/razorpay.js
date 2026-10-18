import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";
import { logServerError } from "../errors/report.js";
import { recordActivity } from "../usage/track.js";
import { PLAN_IDS } from "../schema/plans.js";
import { interpret, verifySignature } from "./razorpayCore.js";

/**
 * Pro subscriptions through Razorpay.
 *
 * Off until it is configured. Selling Pro needs a price at
 * planLimits/pro.priceMinor, a Razorpay plan id at planLimits/pro.razorpayPlanId,
 * and the three secrets below. Missing any of them, the app does not offer
 * Pro and these functions refuse — nothing can be charged by accident.
 *
 * The browser never decides who is Pro. Checkout only collects the payment;
 * the account becomes Pro when Razorpay's signed webhook says the
 * subscription is active, and that is the only thing that writes the plan.
 */

export const KEY_ID = defineSecret("RAZORPAY_KEY_ID");
export const KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
const WEBHOOK_SECRET = defineSecret("RAZORPAY_WEBHOOK_SECRET");

const API = "https://api.razorpay.com/v1";

const razorpay = async (path, body) => {
  const auth = Buffer.from(`${KEY_ID.value()}:${KEY_SECRET.value()}`).toString("base64");
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Razorpay's own message stays in the server log, never in the browser.
    throw Object.assign(new Error(`Razorpay ${path} ${response.status}: ${data?.error?.description || "failed"}`), { status: response.status });
  }
  return data;
};

/** Subscriptions that can still charge someone. */
const LIVE = new Set(["pending", "active", "halted"]);

/**
 * Stops a subscription now, not at the end of the period. Account deletion
 * calls this first: an account that is gone must not keep being charged.
 * Razorpay answers 400 for one that is already cancelled or finished, which
 * is the outcome wanted, so that counts as done.
 */
export const cancelSubscriptionNow = async (billing) => {
  if (!billing?.subscriptionId || !LIVE.has(billing.subscriptionStatus || "pending")) return false;
  try {
    await razorpay(`/subscriptions/${encodeURIComponent(billing.subscriptionId)}/cancel`, { cancel_at_cycle_end: 0 });
  } catch (error) {
    if (error.status !== 400) throw error;
  }
  return true;
};

const proOnSale = async () => {
  const pro = (await db.collection("planLimits").doc(PLAN_IDS.PRO).get()).data() || {};
  const ready = typeof pro.priceMinor === "number" && pro.priceMinor > 0 && typeof pro.razorpayPlanId === "string" && pro.razorpayPlanId;
  return ready ? pro : null;
};

/** Starts a Pro subscription and hands the browser what Checkout needs. */
export const createProSubscription = onCall({ secrets: [KEY_ID, KEY_SECRET] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;

  const pro = await proOnSale();
  if (!pro || !KEY_ID.value() || !KEY_SECRET.value()) {
    throw new HttpsError("failed-precondition", "Pro isn't available yet.");
  }

  const billing = (await db.collection("billing").doc(uid).get()).data() || {};
  if (billing.planId === PLAN_IDS.PRO && billing.subscriptionStatus === "active") {
    throw new HttpsError("already-exists", "You're already on Pro.");
  }

  try {
    const sub = await razorpay("/subscriptions", {
      plan_id: pro.razorpayPlanId,
      total_count: 120,
      customer_notify: 1,
      // The webhook finds the account through this, and only this.
      notes: { uid },
    });

    await db.collection("subscriptions").doc(sub.id).set({
      uid,
      status: "pending",
      provider: "razorpay",
      planId: PLAN_IDS.PRO,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { subscriptionId: sub.id, keyId: KEY_ID.value(), priceMinor: pro.priceMinor, currency: pro.currency || "INR" };
  } catch (error) {
    await logServerError("createProSubscription", error);
    throw new HttpsError("unavailable", "Couldn't start checkout. Try again in a moment.");
  }
});

/** Cancels at the end of the paid period: Pro until then, Free after. */
export const cancelProSubscription = onCall({ secrets: [KEY_ID, KEY_SECRET] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const billing = (await db.collection("billing").doc(request.auth.uid).get()).data() || {};
  if (!billing.subscriptionId) throw new HttpsError("failed-precondition", "There's no subscription to cancel.");

  try {
    await razorpay(`/subscriptions/${encodeURIComponent(billing.subscriptionId)}/cancel`, { cancel_at_cycle_end: 1 });
    await db.collection("billing").doc(request.auth.uid).set(
      { cancelAtPeriodEnd: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { ok: true };
  } catch (error) {
    await logServerError("cancelProSubscription", error);
    throw new HttpsError("unavailable", "Couldn't cancel right now. Try again in a moment.");
  }
});

/**
 * Applies one verified webhook event. Exported for tests; the HTTP wrapper
 * below does the signature check and the idempotency record.
 */
export const applyEvent = async (event) => {
  const change = interpret(event);
  if (!change) return "ignored";

  const batch = db.batch();

  if (change.subscription) {
    const { id, currentPeriodEndMs, ...rest } = change.subscription;
    batch.set(
      db.collection("subscriptions").doc(id),
      {
        ...rest,
        currentPeriodEnd: currentPeriodEndMs ? Timestamp.fromMillis(currentPeriodEndMs) : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (change.billing && change.uid) {
    const end = change.subscription?.currentPeriodEndMs;
    batch.set(
      db.collection("billing").doc(change.uid),
      {
        ...change.billing,
        provider: "razorpay",
        currentPeriodEnd: end ? Timestamp.fromMillis(end) : null,
        cancelAtPeriodEnd: change.billing.planId === PLAN_IDS.PRO ? FieldValue.delete() : false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (change.payment?.id) {
    const { id, createdAtMs, ...rest } = change.payment;
    batch.set(
      db.collection("payments").doc(id),
      {
        ...rest,
        createdAt: createdAtMs ? Timestamp.fromMillis(createdAtMs) : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
  if (change.activity && change.uid) await recordActivity(change.activity, change.uid).catch(() => {});
  return "applied";
};

/**
 * Razorpay's webhook endpoint.
 *
 * Verified before anything is read: an unsigned or wrongly signed request is
 * refused without touching the database. Each event id is recorded once in
 * webhookEvents, so Razorpay's retries are acknowledged without being applied
 * twice. The receipt keeps the event's id, type and outcome — never the
 * payload.
 */
export const razorpayWebhook = onRequest({ secrets: [WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  // A placeholder secret (set so the functions deploy before Pro is sold) is
  // no secret at all, so nothing is accepted until a real one is in place.
  const secret = WEBHOOK_SECRET.value();
  if (!secret || secret.length < 16 || !verifySignature(req.rawBody, req.get("x-razorpay-signature"), secret)) {
    res.status(401).send("Bad signature");
    return;
  }

  let event;
  try {
    event = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    res.status(400).send("Bad body");
    return;
  }

  const eventId = req.get("x-razorpay-event-id") || `${event.event}_${event.created_at}`;
  const receipt = db.collection("webhookEvents").doc(eventId.replace(/[/]/g, "_"));

  try {
    await receipt.create({ type: event.event || "unknown", status: "received", provider: "razorpay", retries: 0, createdAt: FieldValue.serverTimestamp() });
  } catch (error) {
    if (error?.code === 6) {
      // Seen before. Acknowledge so Razorpay stops retrying; do not re-apply.
      await receipt.update({ retries: FieldValue.increment(1) }).catch(() => {});
      res.status(200).send("Duplicate");
      return;
    }
    throw error;
  }

  try {
    const outcome = await applyEvent(event);
    await receipt.update({ status: outcome === "applied" ? "processed" : "ignored", processedAt: FieldValue.serverTimestamp() });
    res.status(200).send("OK");
  } catch (error) {
    await receipt.update({ status: "failed" }).catch(() => {});
    await logServerError("razorpayWebhook", error);
    // A 500 makes Razorpay retry, which is what a transient failure needs —
    // so the receipt is removed and the retry gets a fresh attempt.
    await receipt.delete().catch(() => {});
    res.status(500).send("Retry");
  }
});
