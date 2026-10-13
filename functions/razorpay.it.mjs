// Razorpay webhook against the Firestore emulator:  npm run test:functions
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_0123456789";
import { createHmac } from "node:crypto";
import { db } from "./src/firebaseAdmin.js";
import { cancelSubscriptionNow, razorpayWebhook } from "./src/billing/razorpay.js";
const out = []; const check = (n, ok, d = "") => out.push({ n, ok: !!ok, d });

const call = async (event, { secret = "whsec_test_0123456789", id = "evt_" + Math.random().toString(36).slice(2), method = "POST" } = {}) => {
  const rawBody = Buffer.from(JSON.stringify(event));
  const headers = { "x-razorpay-signature": createHmac("sha256", secret).update(rawBody).digest("hex"), "x-razorpay-event-id": id };
  const req = { method, rawBody, headers, get: (h) => headers[h.toLowerCase()], header: (h) => headers[h.toLowerCase()] };
  let status = 200; let body = "";
  await new Promise((resolve) => {
    const res = { status(s) { status = s; return res; }, send(b) { body = b; resolve(); return res; }, set() { return res; }, setHeader() {}, getHeader() {}, end() { resolve(); } };
    Promise.resolve(razorpayWebhook(req, res)).catch((e) => { body = String(e); status = 599; resolve(); });
  });
  return { status, body };
};
const sub = (event, status, uid = "u1") => ({ event, created_at: 1, payload: { subscription: { entity: { id: "sub_it", status, current_end: 1900000000, notes: { uid } } } } });
const billing = async () => (await db.collection("billing").doc("u1").get()).data() || {};

await db.collection("billing").doc("u1").set({ planId: "free" });

let r = await call(sub("subscription.activated", "active"), { secret: "wrong" });
check("1. a wrongly signed request is refused", r.status === 401, r.status);
check("2. ...and changes nothing", (await billing()).planId === "free");

r = await call(sub("subscription.activated", "active"), { method: "GET" });
check("3. non-POST is refused", r.status === 405, r.status);

r = await call(sub("subscription.activated", "active"), { id: "evt_act" });
let b = await billing();
check("4. a signed activation makes the account Pro", r.status === 200 && b.planId === "pro" && b.subscriptionStatus === "active", JSON.stringify({ r, b }));
check("5. ...with the period end stored", b.currentPeriodEnd?.toMillis?.() === 1900000000 * 1000);
const s = (await db.collection("subscriptions").doc("sub_it").get()).data();
check("6. the subscription mirror is written", s?.status === "active" && s.uid === "u1" && s.provider === "razorpay", JSON.stringify(s));

const receipt = (await db.collection("webhookEvents").doc("evt_act").get()).data();
check("7. the receipt keeps type and outcome, never the payload", receipt?.status === "processed" && receipt.type === "subscription.activated" && !("payload" in receipt), JSON.stringify(receipt));

await db.collection("billing").doc("u1").set({ planId: "free" }, { merge: true });
r = await call(sub("subscription.activated", "active"), { id: "evt_act" });
check("8. a retried event is acknowledged but not applied twice", r.status === 200 && r.body === "Duplicate" && (await billing()).planId === "free", JSON.stringify(r));
check("9. ...and counted as a retry", (await db.collection("webhookEvents").doc("evt_act").get()).data()?.retries === 1);

r = await call({ event: "subscription.charged", created_at: 2, payload: { ...sub("x", "active").payload, payment: { entity: { id: "pay_it", status: "captured", amount: 9900, currency: "INR", created_at: 1760000000 } } } });
const p = (await db.collection("payments").doc("pay_it").get()).data();
check("10. a renewal records the payment in paise", p?.amountMinor === 9900 && p.status === "captured" && p.uid === "u1", JSON.stringify(p));

r = await call(sub("subscription.halted", "halted"));
b = await billing();
check("11. a halted subscription drops the account to Free", b.planId === "free" && b.subscriptionStatus === "halted", JSON.stringify(b));

r = await call({ event: "order.paid", payload: {} }, { id: "evt_other" });
check("12. events the app doesn't use are acknowledged as ignored", r.status === 200 && (await db.collection("webhookEvents").doc("evt_other").get()).data()?.status === "ignored");

const acts = (await db.collection("activityEvents").where("uid", "==", "u1").get()).docs.map((d) => d.data().type).sort();
check("13. pro_started and pro_ended land in the activity feed", acts.includes("pro_started") && acts.includes("pro_ended"), JSON.stringify(acts));

process.env.RAZORPAY_WEBHOOK_SECRET = "none";
r = await call(sub("subscription.activated", "active"), { secret: "none" });
check("14. a placeholder webhook secret accepts nothing, even correctly signed", r.status === 401, r.status);
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_0123456789";

// Razorpay itself is faked here: only the request the cancel makes is checked.
const realFetch = globalThis.fetch; const sent = [];
const fakeFetch = (status) => async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(status === 200 ? {} : { error: { description: "x" } }), { status }); };
globalThis.fetch = fakeFetch(200);
const cancelled = await cancelSubscriptionNow({ subscriptionId: "sub_live", subscriptionStatus: "active" });
check("15. deleting an account cancels a live subscription immediately", cancelled && sent[0]?.url.endsWith("/subscriptions/sub_live/cancel") && sent[0].body.cancel_at_cycle_end === 0, JSON.stringify(sent));
sent.length = 0;
check("16. ...and leaves an already-ended one alone", (await cancelSubscriptionNow({ subscriptionId: "sub_old", subscriptionStatus: "cancelled" })) === false && sent.length === 0);
globalThis.fetch = fakeFetch(400);
check("17. Razorpay saying it's already cancelled counts as done", (await cancelSubscriptionNow({ subscriptionId: "sub_x", subscriptionStatus: "active" })) === true);
globalThis.fetch = fakeFetch(500);
let blocked = false;
try { await cancelSubscriptionNow({ subscriptionId: "sub_x", subscriptionStatus: "active" }); } catch { blocked = true; }
check("18. a Razorpay outage stops the deletion rather than leaving a card being charged", blocked);
globalThis.fetch = realFetch;

for (const x of out) console.log(`${x.ok ? "  PASS" : "  FAIL"}  ${x.n}${!x.ok && x.d ? "\n        " + x.d : ""}`);
console.log(`\n${out.filter((x) => x.ok).length} passed, ${out.filter((x) => !x.ok).length} failed`);
process.exit(out.every((x) => x.ok) ? 0 : 1);
