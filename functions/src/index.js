import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { EMAIL_POLICY, extractDomain, normalizeEmail } from "./emailPolicy.js";

initializeApp();

const db = getFirestore();
const RATE_LIMIT_COLLECTION = "authRateLimits";

const buildRateKeys = ({ ip = "unknown-ip", email = "", deviceId = "unknown-device" }) => {
  const normalizedEmail = normalizeEmail(email);

  return [
    `ip:${ip}`,
    `email:${normalizedEmail || "unknown-email"}`,
    `device:${deviceId || "unknown-device"}`,
  ];
};

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

  if (EMAIL_POLICY.blockedDisposableDomains.includes(domain)) {
    throwPolicyError(
      EMAIL_POLICY.errorCodes.DISPOSABLE_EMAIL_BLOCKED,
      "Disposable email addresses are not allowed.",
    );
  }

  if (!EMAIL_POLICY.allowedProviders.includes(domain)) {
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

export const authorizeAuthAttempt = onCall(async (request) => {
  const { email = "", deviceId = "", mode = "login" } = request.data || {};
  const ip = request.rawRequest.ip || "unknown-ip";

  const normalizedEmail = enforceEmailPolicy(email);
  await enforceRateLimit({ ip, email: normalizedEmail, deviceId });

  return {
    ok: true,
    mode,
    normalizedEmail,
  };
});
