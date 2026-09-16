#!/usr/bin/env node
/**
 * Grants the first owner claim.
 *
 * The setAdminClaim Function requires an existing owner to call it, which means
 * owner number one has to come from outside the running app. This script does
 * that once, from your machine, with a service account key that never goes near
 * the browser or the repo.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
 *   node scripts/bootstrap-admin.mjs you@example.com
 *
 * Get the key from Firebase Console > Project settings > Service accounts >
 * Generate new private key. Keep it out of git — .gitignore already covers
 * *.json only inside node_modules, so store it somewhere else entirely.
 *
 * Run it again with --revoke to take the claim away:
 *   node scripts/bootstrap-admin.mjs you@example.com --revoke
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email, ...flags] = process.argv.slice(2);
const revoke = flags.includes("--revoke");
const role = revoke ? null : "owner";

if (!email) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <email> [--revoke]");
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account key path first.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });

const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  const existing = user.customClaims || {};

  await auth.setCustomUserClaims(user.uid, {
    ...existing,
    admin: !revoke,
    adminRole: role,
  });

  // The old token still carries the old claims until it expires, so force a
  // refresh instead of waiting up to an hour.
  await auth.revokeRefreshTokens(user.uid);

  console.log(
    revoke
      ? `Revoked admin from ${email} (${user.uid}). Sign out and back in.`
      : `Granted owner to ${email} (${user.uid}). Sign out and back in to pick up the claim.`,
  );
  process.exit(0);
} catch (error) {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
}
