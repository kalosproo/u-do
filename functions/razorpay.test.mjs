// Razorpay webhook interpretation tests.   node --test functions/razorpay.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { interpret, planFor, subscriptionStatus, verifySignature } from "./src/billing/razorpayCore.js";

const sign = (body, secret) => createHmac("sha256", secret).update(body).digest("hex");

const subEvent = (event, status, extra = {}) => ({
  event,
  payload: {
    subscription: { entity: { id: "sub_1", status, current_end: 1760000000, notes: { uid: "u1" }, ...extra } },
  },
});

test("a body signed with the webhook secret is accepted", () => {
  const body = Buffer.from('{"event":"subscription.activated"}');
  assert.equal(verifySignature(body, sign(body, "whsec"), "whsec"), true);
});

test("a wrong secret, a tampered body or a missing signature is refused", () => {
  const body = Buffer.from('{"event":"subscription.activated"}');
  assert.equal(verifySignature(body, sign(body, "other"), "whsec"), false);
  assert.equal(verifySignature(Buffer.from('{"event":"x"}'), sign(body, "whsec"), "whsec"), false);
  assert.equal(verifySignature(body, undefined, "whsec"), false);
  assert.equal(verifySignature(body, "short", "whsec"), false);
  assert.equal(verifySignature(body, sign(body, ""), ""), false);
});

test("Razorpay states fold into the console's five, and only active is Pro", () => {
  assert.equal(subscriptionStatus("authenticated"), "pending");
  assert.equal(subscriptionStatus("active"), "active");
  assert.equal(subscriptionStatus("halted"), "halted");
  assert.equal(subscriptionStatus("completed"), "expired");
  assert.equal(subscriptionStatus("something-new"), "pending");
  assert.equal(planFor("active"), "pro");
  for (const s of ["pending", "halted", "cancelled", "expired"]) assert.equal(planFor(s), "free");
});

test("activation makes the account in notes.uid Pro and records pro_started", () => {
  const c = interpret(subEvent("subscription.activated", "active"));
  assert.equal(c.uid, "u1");
  assert.deepEqual(c.billing, { planId: "pro", subscriptionStatus: "active", subscriptionId: "sub_1" });
  assert.equal(c.subscription.currentPeriodEndMs, 1760000000 * 1000);
  assert.equal(c.activity, "pro_started");
});

test("a renewal keeps Pro without a second pro_started", () => {
  const c = interpret({
    ...subEvent("subscription.charged", "active"),
    payload: {
      ...subEvent("subscription.charged", "active").payload,
      payment: { entity: { id: "pay_1", status: "captured", amount: 9900, currency: "INR", created_at: 1760000000 } },
    },
  });
  assert.equal(c.billing.planId, "pro");
  assert.equal(c.activity, null);
  assert.deepEqual(
    { id: c.payment.id, status: c.payment.status, amountMinor: c.payment.amountMinor, subscriptionId: c.payment.subscriptionId },
    { id: "pay_1", status: "captured", amountMinor: 9900, subscriptionId: "sub_1" },
  );
});

test("halted, cancelled and completed drop the account to Free with pro_ended", () => {
  for (const [event, status] of [["subscription.halted", "halted"], ["subscription.cancelled", "cancelled"], ["subscription.completed", "completed"]]) {
    const c = interpret(subEvent(event, status));
    assert.equal(c.billing.planId, "free", event);
    assert.equal(c.activity, "pro_ended", event);
  }
});

test("a subscription with no uid in its notes changes no account", () => {
  const c = interpret(subEvent("subscription.activated", "active", { notes: {} }));
  assert.equal(c.billing, null);
  assert.equal(c.subscription.id, "sub_1");
});

test("a failed payment is recorded but changes no plan", () => {
  const c = interpret({ event: "payment.failed", payload: { payment: { entity: { id: "pay_2", status: "failed", amount: 9900, notes: { uid: "u1" } } } } });
  assert.equal(c.billing, null);
  assert.equal(c.payment.status, "failed");
  assert.equal(c.payment.uid, "u1");
});

test("events this app does not act on are ignored", () => {
  assert.equal(interpret({ event: "order.paid", payload: {} }), null);
  assert.equal(interpret({}), null);
  assert.equal(interpret(null), null);
});

test("a non-integer amount is never stored as money", () => {
  const c = interpret({ event: "payment.captured", payload: { payment: { entity: { id: "p", status: "captured", amount: 99.5 } } } });
  assert.equal(c.payment.amountMinor, null);
});
