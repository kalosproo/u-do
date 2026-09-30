import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { buildRateKeys, clientIp, EMAIL_POLICY, extractDomain, normalizeEmail } from "./emailPolicy.js";
import { db } from "./firebaseAdmin.js";

const RATE_LIMIT_COLLECTION = "authRateLimits";

const getLimitForKey = (key) => {
  if (key.startsWith("ip:")) return EMAIL_POLICY.rateLimit.maxAttemptsPerIp;
  if (key.startsWith("email:")) return EMAIL_POLICY.rateLimit.maxAttemptsPerEmail;
  return EMAIL_POLICY.rateLimit.maxAttemptsPerDevice;
};

const throwPolicyError = (policyCode, message) => {
  throw new HttpsError("failed-precondition", message, { policyCode });
};

const enforceEmailPolicy = (email) => {
  const normalized = normalizeEmail(email);
  const domain = extractDomain(normalized);

  if (!normalized || !domain) {
    throwPolicyError(EMAIL_POLICY.errorCodes.INVALID_EMAIL, "Email address is invalid.");
  }

  if (EMAIL_POLICY.blockedDisposableDomains.length > 0 && EMAIL_POLICY.blockedDisposableDomains.includes(domain)) {
    throwPolicyError(
      EMAIL_POLICY.errorCodes.DISPOSABLE_EMAIL_BLOCKED,
      "Disposable email addresses are not allowed.",
    );
  }

  if (EMAIL_POLICY.allowedProviders.length > 0 && !EMAIL_POLICY.allowedProviders.includes(domain)) {
    throwPolicyError(EMAIL_POLICY.errorCodes.DOMAIN_NOT_ALLOWED, "Email domain is not allowed.");
  }

  return normalized;
};

const enforceRateLimit = async ({ ip, email, deviceId }) => {
  const keys = buildRateKeys({ ip, email, deviceId });
  const now = Date.now();
  const windowMs = EMAIL_POLICY.rateLimit.windowSeconds * 1000;

  await db.runTransaction(async (transaction) => {
    const docs = await Promise.all(
      keys.map((key) => transaction.get(db.collection(RATE_LIMIT_COLLECTION).doc(key))),
    );

    for (let index = 0; index < docs.length; index += 1) {
      const snap = docs[index];
      const key = keys[index];
      const limit = getLimitForKey(key);
      const data = snap.exists ? snap.data() : {};
      const windowStart = data.windowStart || now;
      const count = windowStart + windowMs < now ? 0 : data.count || 0;

      if (count >= limit) {
        throwPolicyError(
          EMAIL_POLICY.errorCodes.RATE_LIMITED,
          "Too many attempts. Please try again later.",
        );
      }

      const nextWindowStart = windowStart + windowMs < now ? now : windowStart;

      transaction.set(
        db.collection(RATE_LIMIT_COLLECTION).doc(key),
        {
          count: count + 1,
          windowStart: nextWindowStart,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  });
};

/**
 * The brake in front of sign-in, called before any credential reaches Firebase.
 *
 * It has been deployed since the auth work landed and nothing called it, so
 * every login path has been unthrottled this whole time.
 */
export const authorizeAuthAttempt = onCall(async (request) => {
  const { email = "", deviceId = "", mode = "login" } = request.data || {};

  // A provider sign-in has no address to apply the email policy to yet — the
  // popup has not returned. Running the policy anyway would reject it as an
  // invalid email and block every Google sign-in outright. The attempt is
  // still counted, by IP and by device.
  const federated = mode === "google";
  const normalizedEmail = federated ? "" : enforceEmailPolicy(email);

  await enforceRateLimit({ ip: clientIp(request), email: normalizedEmail, deviceId });

  return {
    ok: true,
    mode,
    normalizedEmail,
  };
});

// Admin console. Every callable below is gated on the `admin` custom claim and
// reads through the Admin SDK, so nothing here widens what a normal account can
// see. firebaseAdmin.js is the shared init both sides depend on.
export { getAdminIdentity, setAdminClaim } from "./admin/claims.js";
export { getAdminOverview } from "./admin/overview.js";
export { listAdminUsers, findAdminUser, getAdminUserDetail } from "./admin/users.js";
export { seedPlanLimits, backfillBilling } from "./admin/billing.js";

// Reminders. The scheduled one derives each person's local time from the IANA
// zone they stored, so it cannot drift across a DST change; the two triggers
// fire on the event itself and ignore the clock.
// The assistant. Its key was in the browser bundle until now; it is a
// Firebase secret here and the client only ever sees the answer.
export { askAssistant } from "./ai/assistant.js";

export { sendScheduledReminders } from "./notifications/digest.js";
export { onFriendRequest, onFriendAdded } from "./notifications/friends.js";
