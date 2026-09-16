import { HttpsError } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";

/**
 * Admin identity comes from the Firebase ID token's custom claims, which only
 * the Admin SDK can set. Nothing the browser sends is trusted: no email
 * allowlist, no `isAdmin` in the request body, no Firestore flag a client
 * could write to itself.
 */

export const ADMIN_ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  SUPPORT: "support",
});

const ROLE_RANK = Object.freeze({
  [ADMIN_ROLES.SUPPORT]: 1,
  [ADMIN_ROLES.ADMIN]: 2,
  [ADMIN_ROLES.OWNER]: 3,
});

/**
 * Returns the calling admin, or throws. Every admin callable starts with this.
 *
 * The returned requestId is what ties a mutation to its audit entry, so the
 * caller passes the same one into writeAuditLog.
 */
export const requireAdmin = (request, { minimumRole = ADMIN_ROLES.SUPPORT } = {}) => {
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Sign in to use the admin console.");
  }

  const token = auth.token || {};

  if (token.admin !== true) {
    throw new HttpsError("permission-denied", "This account is not an admin.");
  }

  const role = typeof token.adminRole === "string" ? token.adminRole : ADMIN_ROLES.SUPPORT;
  const rank = ROLE_RANK[role] || 0;

  if (rank < (ROLE_RANK[minimumRole] || 0)) {
    throw new HttpsError(
      "permission-denied",
      `This action needs the ${minimumRole} role.`,
    );
  }

  return {
    uid: auth.uid,
    role,
    email: token.email || null,
    requestId: randomUUID(),
  };
};

/** Keeps a page size honest so no admin screen can ask for the whole collection. */
export const clampLimit = (value, { fallback = 25, max = 50 } = {}) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};
