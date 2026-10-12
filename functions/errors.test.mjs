// Error-report scrubbing tests.   node --test functions/errors.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cleanRoute, fingerprint, normalizeReport, redact } from "./src/errors/scrub.js";

test("emails, long numbers and URL query strings never reach storage", () => {
  const out = redact("failed for haneesh@example.com at https://u-do.app/x?token=abc#frag phone 9876543210");
  assert.ok(!out.includes("haneesh@example.com"));
  assert.ok(!out.includes("token=abc") && !out.includes("#frag"));
  assert.ok(!out.includes("9876543210"));
  assert.ok(out.includes("https://u-do.app/x"), out);
});

test("short numbers survive, so line and column numbers stay useful", () => {
  assert.equal(redact("at Finance.jsx:212:14"), "at Finance.jsx:212:14");
});

test("a route keeps its path and loses everything after it", () => {
  assert.equal(cleanRoute("/finance?ref=mail#top"), "/finance");
  assert.equal(cleanRoute(""), "/");
});

test("the same crash gets the same fingerprint, a different one does not", () => {
  const a = fingerprint("x is undefined", "TypeError\n    at render (Finance.jsx:10:3)");
  const b = fingerprint("x is undefined", "TypeError\n    at render (Finance.jsx:10:3)\n    at more");
  const c = fingerprint("x is undefined", "TypeError\n    at other (Home.jsx:5:1)");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("reports are bounded and junk is refused", () => {
  assert.equal(normalizeReport(null), null);
  assert.equal(normalizeReport({ message: "   " }), null);
  const r = normalizeReport({ message: "m".repeat(5000), stack: "s".repeat(50000), userAgent: "u".repeat(999), source: "render" });
  assert.equal(r.message.length, 300);
  assert.equal(r.stack.length, 3000);
  assert.equal(r.userAgent.length, 200);
});

test("nothing identifies the person who hit the error", () => {
  const r = normalizeReport({ message: "boom", uid: "abc123", email: "a@b.co" });
  assert.ok(!("uid" in r) && !("email" in r));
});
