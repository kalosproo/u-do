/**
 * Turns a Firebase error into something a person can act on. A refusal from
 * the security rules or a missing server function nearly always means the
 * server hasn't been updated for a new feature yet — not that the person's
 * connection is bad — so it says that instead.
 */
const NOT_READY = new Set([
  "permission-denied",
  "firestore/permission-denied",
  "functions/not-found",
  "functions/failed-precondition",
  "functions/unimplemented",
]);

export const friendlyError = (error, fallback = "Something went wrong. Try again.") => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You're offline. Check your connection and try again.";
  }
  if (NOT_READY.has(error?.code)) return "This isn't switched on yet. Try again later.";
  return fallback;
};
