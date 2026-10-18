import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import { logServerError } from "../errors/report.js";

/**
 * Signs the account out on every device.
 *
 * Revoking refresh tokens stops every other session from getting a new ID
 * token. One it already holds stays valid until it expires — at most an hour —
 * which is how Firebase sessions work and what the Security card tells people.
 * No recent sign-in is required: this only ever takes access away.
 */
export const signOutEverywhere = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  try {
    await getAuth().revokeRefreshTokens(request.auth.uid);
    return { ok: true };
  } catch (error) {
    await logServerError("signOutEverywhere", error);
    throw new HttpsError("unavailable", "Couldn't sign out other devices. Try again in a moment.");
  }
});
