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
