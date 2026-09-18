/**
 * The one place the policy's identity lives.
 *
 * Consent is recorded against a version rather than as a boolean, so that
 * raising the number here is all it takes to ask everyone again. A boolean
 * would make "they agreed" permanently true no matter how much the policy
 * later changed, which is the failure mode worth designing out.
 */
export const PRIVACY_POLICY_VERSION = 1;
export const PRIVACY_POLICY_UPDATED = "18 September 2026";

/** True when this account has not accepted the version currently published. */
export const needsConsent = (record) =>
  !record || Number(record.privacyVersion) !== PRIVACY_POLICY_VERSION;
