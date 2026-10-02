// Rate-limit key tests.
//
//   node --test functions/auth.test.mjs
//
// Both bugs these cover would have locked every user out of U.Do at once
// rather than failing visibly for one person, which is the failure mode worth
// writing tests for: a shared counter does not look broken until nobody can
// sign in.
import test from "node:test";
import assert from "node:assert/strict";

import { buildRateKeys, clientIp, EMAIL_POLICY } from "./src/emailPolicy.js";

test("a normal attempt is counted three ways", () => {
  const keys = buildRateKeys({ ip: "1.2.3.4", email: "A@Example.com", deviceId: "dev-1" });
  assert.deepEqual(keys.sort(), ["device:dev-1", "email:a@example.com", "ip:1.2.3.4"]);
});

test("the email is lowercased before it becomes a key", () => {
  // Otherwise "A@x.com" and "a@x.com" are separate buckets and the per-email
  // limit is trivially doubled.
  const upper = buildRateKeys({ ip: "1.1.1.1", email: "HELLO@X.COM", deviceId: "d" });
  const lower = buildRateKeys({ ip: "1.1.1.1", email: "hello@x.com", deviceId: "d" });
  assert.deepEqual(upper, lower);
});

test("no email means no email key, not a shared one", () => {
  // A Google sign-in has no address yet. Bucketing those under one
  // "unknown-email" key would mean ten of them anywhere locked out everyone.
  const keys = buildRateKeys({ ip: "1.2.3.4", email: "", deviceId: "dev-1" });
  assert.equal(keys.length, 2);
  assert.ok(!keys.some((k) => k.startsWith("email:")), keys.join(","));
});

test("a missing device still gets its own key rather than none", () => {
  const keys = buildRateKeys({ ip: "9.9.9.9", email: "a@b.com", deviceId: "" });
  assert.ok(keys.includes("device:unknown-device"));
});

test("the client address comes from the edge header, not the load balancer", () => {
  // req.ip on Cloud Run is Google's balancer. Counting on it puts every user
  // of U.Do into one bucket.
  const request = {
    rawRequest: {
      headers: { "x-forwarded-for": "203.0.113.7, 35.191.0.1, 130.211.0.1" },
      ip: "169.254.1.1",
    },
  };
  assert.equal(clientIp(request), "203.0.113.7");
});

test("a single-entry forwarded header still works", () => {
  assert.equal(clientIp({ rawRequest: { headers: { "x-forwarded-for": "198.51.100.5" } } }), "198.51.100.5");
});

test("without the header it falls back rather than throwing", () => {
  assert.equal(clientIp({ rawRequest: { headers: {}, ip: "198.51.100.9" } }), "198.51.100.9");
  assert.equal(clientIp({}), "unknown-ip");
});

test("the policy blocks nothing by domain today", () => {
  // Wiring the limiter up must not start rejecting signups. Both lists are
  // empty and the callable guards on .length, so only rate limiting is live.
  assert.deepEqual(EMAIL_POLICY.allowedProviders, []);
  assert.deepEqual(EMAIL_POLICY.blockedDisposableDomains, []);
});

test("the limits are the ones the product intends", () => {
  assert.equal(EMAIL_POLICY.rateLimit.windowSeconds, 900);
  assert.equal(EMAIL_POLICY.rateLimit.maxAttemptsPerIp, 20);
  assert.equal(EMAIL_POLICY.rateLimit.maxAttemptsPerEmail, 10);
  assert.equal(EMAIL_POLICY.rateLimit.maxAttemptsPerDevice, 15);
});
