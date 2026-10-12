import { httpsCallable } from "firebase/functions";

import { functions } from "./firebase";

/**
 * The brake in front of sign-in and signup.
 *
 * authorizeAuthAttempt has been deployed since the auth work landed, and
 * nothing has ever called it. A rate limiter that no code path reaches is
 * worse than none: it costs money to deploy and it makes the codebase look
 * protected while every login endpoint stands wide open to guessing.
 *
 * The server counts attempts three ways — by IP, by email and by device — over
 * a fifteen-minute window, so one attacker cannot spread a guessing run across
 * addresses, and one unlucky campus NAT cannot lock out a whole hostel by
 * itself.
 */
const DEVICE_KEY = "u_do_device";

/**
 * A stable-ish id for this browser, so the per-device count means something.
 *
 * Not an identifier we treat as trustworthy: anyone can clear it, and the
 * server counts by IP and email as well for exactly that reason. It exists to
 * catch the ordinary case, not a determined attacker.
 */
const deviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Private mode, blocked storage. The other two counters still apply.
    return "unknown-device";
  }
};

/** What the server's policy codes mean to a person trying to sign in. */
const POLICY_MESSAGE = {
  RATE_LIMITED: "Too many attempts from here. Wait about fifteen minutes and try again.",
  DISPOSABLE_EMAIL_BLOCKED: "That email provider isn't accepted. Use a different address.",
  DOMAIN_NOT_ALLOWED: "That email domain isn't accepted here.",
  INVALID_EMAIL: "Enter a valid email address.",
};

/**
 * Asks the server whether this attempt may proceed. Throws with a readable
 * message when it may not.
 *
 * A failure to *reach* the check is deliberately not a failure to sign in.
 * Firebase Auth enforces its own limits underneath, and a cold start or a
 * dropped connection here must not lock people out of their own account —
 * that would turn an availability blip into an outage.
 */
export const authorizeAttempt = async ({ email, mode }) => {
  try {
    const call = httpsCallable(functions, "authorizeAuthAttempt");
    await call({ email, mode, deviceId: deviceId() });
  } catch (error) {
    const policyCode = error?.details?.policyCode;

    if (policyCode) {
      const refusal = new Error(POLICY_MESSAGE[policyCode] || "That attempt was refused.");
      refusal.policyCode = policyCode;
      throw refusal;
    }

    if (error?.code === "functions/failed-precondition") {
      throw new Error(error.message || "That attempt was refused.");
    }

    console.warn("authorizeAttempt: the check could not be reached", error);
  }
};
