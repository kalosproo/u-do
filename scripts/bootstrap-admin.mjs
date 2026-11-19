#!/usr/bin/env node
/**
 * Grants the first owner claim or recovers console access from a trusted machine.
 *
 * The setAdminClaim Function requires an existing owner to call it, which means
 * owner number one has to come from outside the running app. This script uses
 * a service account directly. Keep its key outside the repository.
 *
 * Usage:
 *   npm install --prefix functions
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
 *   node scripts/bootstrap-admin.mjs you@example.com
 *   node scripts/bootstrap-admin.mjs you@example.com --role=admin
 *
 * Get the key from Firebase Console > Project settings > Service accounts >
 * Generate new private key. Omitting the role grants owner access.
 *
 * Run it again with --revoke to take the claim away:
 *   node scripts/bootstrap-admin.mjs you@example.com --revoke
 */

import { createRequire } from "node:module";

const [email, option = "--role=owner", ...extra] = process.argv.slice(2);
if (!email || email.startsWith("-") || extra.length || !["--role=owner", "--role=admin", "--revoke"].includes(option)) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <email> [--role=owner | --role=admin | --revoke]");
  process.exit(1);
}
const revoke = option === "--revoke";
const role = revoke ? null : option.slice("--role=".length);

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account key path first.");
  process.exit(1);
}

// The Functions package owns the Admin SDK dependency.
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
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
      : `Granted ${role} to ${email} (${user.uid}). Sign out and back in to pick up the claim.`,
  );
  process.exit(0);
} catch (error) {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
}
