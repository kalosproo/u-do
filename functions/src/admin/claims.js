import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";

import { ADMIN_ROLES, requireAdmin } from "./guard.js";
import { writeAuditLog } from "./audit.js";


const isValidRole = (role) => Object.values(ADMIN_ROLES).includes(role);

/**
 * Grant or revoke admin access.
 *
 * Only an owner can call this, and the very first owner cannot be created
 * here — it is set once from scripts/bootstrap-admin.mjs with a service
 * account. That keeps the privilege chain rooted outside the running app.
 */
export const setAdminClaim = onCall(async (request) => {
  const admin = requireAdmin(request, { minimumRole: ADMIN_ROLES.OWNER });
  const { targetUid = "", role = ADMIN_ROLES.ADMIN, revoke = false } = request.data || {};

  if (!targetUid) {
    throw new HttpsError("invalid-argument", "targetUid is required.");
  }

  if (targetUid === admin.uid && revoke) {
    throw new HttpsError(
      "failed-precondition",
      "Revoking your own access would lock you out. Ask another owner.",
    );
  }

  if (!revoke && !isValidRole(role)) {
    throw new HttpsError("invalid-argument", `Unknown role: ${role}`);
  }

  const auth = getAuth();
  const target = await auth.getUser(targetUid).catch(() => null);

  if (!target) {
    throw new HttpsError("not-found", "No account with that UID.");
  }

  const existing = target.customClaims || {};
  const nextClaims = revoke
    ? { ...existing, admin: false, adminRole: null }
    : { ...existing, admin: true, adminRole: role };

  await auth.setCustomUserClaims(targetUid, nextClaims);

  // Forces the target's next request to fetch a fresh token, so a revoke takes
  // effect within about an hour rather than whenever their token happens to
  // expire. The admin app also refreshes its own token on every load.
  await auth.revokeRefreshTokens(targetUid);

  await writeAuditLog(db, {
    admin,
    action: revoke ? "admin.revoke" : "admin.grant",
    targetUid,
    metadata: { role: revoke ? null : role, targetEmail: target.email || null },
  });

  return { ok: true, targetUid, admin: !revoke, adminRole: revoke ? null : role };
});

/**
 * Lets the admin app confirm what the server thinks of the caller, rather than
 * trusting a decoded token alone. Cheap, and it makes the shell's gate honest.
 */
export const getAdminIdentity = onCall(async (request) => {
  const admin = requireAdmin(request);

  return {
    uid: admin.uid,
    role: admin.role,
    email: admin.email,
  };
});
