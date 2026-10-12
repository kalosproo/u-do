import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { auth, functions, googleProvider } from "./firebase";

/**
 * Deleting the account, from the browser's side.
 *
 * The work happens on the server — most of what has to go is unreachable by
 * the person who owns it. What belongs here is proving, freshly, that the
 * person at the keyboard is the account holder.
 *
 * The server rejects any token whose auth_time is older than five minutes, so
 * this is not decoration: without a real re-authentication the call fails.
 * A signed-in laptop left open should not be two clicks away from destroying
 * somebody's year of tasks.
 */

/** True when the account signed in with a password rather than a provider. */
const usesPassword = (user) =>
  (user?.providerData || []).some((entry) => entry.providerId === "password");

/**
 * Re-authenticates in whichever way this account can.
 *
 * Returns nothing on success and throws a readable error otherwise. A password
 * account needs its password; a Google account needs the popup again.
 */
export const reauthenticate = async ({ password } = {}) => {
  const user = auth.currentUser;
  if (!user) throw new Error("You're not signed in.");

  try {
    if (usesPassword(user)) {
      if (!password) throw new Error("Enter your password to confirm.");
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password),
      );
      return;
    }

    await reauthenticateWithPopup(user, googleProvider);
  } catch (error) {
    switch (error?.code) {
      case "auth/wrong-password":
      case "auth/invalid-credential":
        throw new Error("That password isn't right.");
      case "auth/too-many-requests":
        throw new Error("Too many attempts. Wait a few minutes and try again.");
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        throw new Error("Confirmation was cancelled.");
      case "auth/user-mismatch":
        throw new Error("That account doesn't match the one you're signed in as.");
      default:
        throw new Error(error?.message || "Couldn't confirm it's you.");
    }
  }
};

/** Whether this account will be asked for a password or a Google popup. */
export const reauthMethod = () => (usesPassword(auth.currentUser) ? "password" : "google");

/**
 * Deletes the account and everything attached to it.
 *
 * Signs out afterwards regardless: the Auth record is gone by then, and
 * leaving a dead session in place means every subsequent read fails in a way
 * that looks like a bug rather than like a deletion.
 */
export const deleteAccount = async () => {
  const call = httpsCallable(functions, "deleteMyAccount", { timeout: 300_000 });

  try {
    await call({});
  } catch (error) {
    if (error?.code === "functions/failed-precondition") {
      throw new Error("Please confirm it's you again — that took too long.");
    }
    throw new Error(
      error?.message || "Your account could not be deleted. Try again, or email us.",
    );
  }

  await signOut(auth).catch(() => {});
};
