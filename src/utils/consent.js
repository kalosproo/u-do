/**
 * The one place the policy's identity lives.
 *
 * Consent is recorded against a version rather than as a boolean, so that
 * raising the number here is all it takes to ask everyone again. A boolean
 * would make "they agreed" permanently true no matter how much the policy
 * later changed, which is the failure mode worth designing out.
 */
export const PRIVACY_POLICY_VERSION = 12;
export const PRIVACY_POLICY_UPDATED = "22 October 2026";

/** The Terms of Service, accepted alongside the policy and versioned the same way. */
export const TERMS_VERSION = 1;
export const TERMS_UPDATED = "18 October 2026";

/**
 * Accepting is asked once: an account that has never accepted anything gets
 * the read-and-accept dialog. Later updates don't block anyone again.
 */
export const needsConsent = (record) =>
  !record || (record.privacyVersion == null && record.termsVersion == null);

/** True when the account accepted an older version: worth a quiet notice, not a wall. */
export const consentOutdated = (record) =>
  Boolean(record) &&
  !needsConsent(record) &&
  (Number(record.privacyVersion) !== PRIVACY_POLICY_VERSION || Number(record.termsVersion) !== TERMS_VERSION);
