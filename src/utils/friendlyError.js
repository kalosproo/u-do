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

// What the browser says when the camera or mic can't be used.
const MEDIA = {
  NotAllowedError: "Allow the camera and microphone for U.Do in your browser settings, then try again.",
  SecurityError: "Allow the camera and microphone for U.Do in your browser settings, then try again.",
  NotFoundError: "No camera or microphone was found on this device.",
  NotReadableError: "Another app is using your camera or microphone. Close it and try again.",
  OverconstrainedError: "Your camera can't be used here. Try another device.",
};

export const friendlyError = (error, fallback = "Something went wrong. Try again.") => {
  if (MEDIA[error?.name]) return MEDIA[error.name];
  // Messages written for people, like "the call is full", pass straight through.
  if (error?.userFacing && error.message) return error.message;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You're offline. Check your connection and try again.";
  }
  if (NOT_READY.has(error?.code)) return "This isn't switched on yet. Try again later.";
  return fallback;
};
