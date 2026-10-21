// Consent is asked once.   node --test src/utils/consent.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { consentOutdated, needsConsent, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "./consent.js";

test("an account that never accepted gets the dialog", () => {
  assert.equal(needsConsent(null), true);
  assert.equal(needsConsent({}), true);
});

test("an account that accepted any version is never blocked again", () => {
  assert.equal(needsConsent({ privacyVersion: 1 }), false);
  assert.equal(needsConsent({ privacyVersion: 3, termsVersion: 1 }), false);
});

test("an older acceptance gets a quiet notice; the current one gets nothing", () => {
  assert.equal(consentOutdated({ privacyVersion: 1 }), true);
  assert.equal(consentOutdated({ privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION }), false);
  assert.equal(consentOutdated(null), false);
});
