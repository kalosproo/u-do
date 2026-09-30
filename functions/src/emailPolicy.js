// Backend copy of email policy for server-side enforcement.
export const EMAIL_POLICY = {
  allowedProviders: [],
  blockedDisposableDomains: [],
  errorCodes: {
    INVALID_EMAIL: "INVALID_EMAIL",
    DISPOSABLE_EMAIL_BLOCKED: "DISPOSABLE_EMAIL_BLOCKED",
    DOMAIN_NOT_ALLOWED: "DOMAIN_NOT_ALLOWED",
    RATE_LIMITED: "RATE_LIMITED",
  },
  rateLimit: {
    windowSeconds: 900,
    maxAttemptsPerIp: 20,
    maxAttemptsPerEmail: 10,
    maxAttemptsPerDevice: 15,
  },
};

export const normalizeEmail = (email = "") => email.trim().toLowerCase();

export const extractDomain = (email = "") => normalizeEmail(email).split("@")[1] || "";

export const buildRateKeys = ({ ip = "unknown-ip", email = "", deviceId = "unknown-device" }) => {
  const normalizedEmail = normalizeEmail(email);
  const keys = [`ip:${ip}`, `device:${deviceId || "unknown-device"}`];

  // Only count per-address when there is an address. A federated sign-in does
  // not know the email until the provider hands it back, and bucketing every
  // one of those under a shared "unknown-email" key would mean ten Google
  // sign-ins anywhere in the world locked out everyone else.
  if (normalizedEmail) keys.push(`email:${normalizedEmail}`);

  return keys;
};

/**
 * The client address, as far as it can be trusted.
 *
 * These run on Cloud Run behind Google's load balancer, so req.ip is the
 * balancer rather than the caller — counting on it would put every user of
 * U.Do into one bucket and lock the whole product out after twenty attempts.
 * The leftmost X-Forwarded-For entry is the caller as the edge saw it.
 *
 * That entry is client-supplied and therefore spoofable, which is why it is
 * not the only counter: email and device are counted separately, and an
 * attacker rotating a forged header still trips those. Treating this as a hint
 * rather than as identity is the point.
 */
export const clientIp = (request) => {
  const forwarded = request.rawRequest?.headers?.["x-forwarded-for"];
  const first = String(forwarded || "").split(",")[0].trim();
  return first || request.rawRequest?.ip || "unknown-ip";
};
