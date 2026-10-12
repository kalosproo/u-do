import { createHash } from "node:crypto";

/**
 * Pure clean-up for error reports. No Admin SDK, so it is testable alone.
 *
 * A stack trace is the developer's view of a crash, but it is also text that
 * can carry whatever the code was holding: a URL with a token in its query
 * string, an email in a message, a phone number. Reports are scrubbed before
 * they are stored, and no account id is stored with them at all.
 */

export const LIMITS = Object.freeze({ message: 300, stack: 3000, route: 200, userAgent: 200, source: 40 });

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_NUMBER = /\b\d{6,}\b/g;
// Query strings and fragments, wherever a URL appears in the text.
const URL_TAIL = /(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g;

export const redact = (text) =>
  String(text ?? "")
    .replace(URL_TAIL, "$1")
    .replace(EMAIL, "[email]")
    .replace(LONG_NUMBER, "[number]");

const clip = (text, limit) => redact(text).slice(0, limit);

/** The path only: "/finance", never "/finance?ref=…" or a fragment. */
export const cleanRoute = (route) => clip(String(route ?? "").split(/[?#]/)[0] || "/", LIMITS.route);

/**
 * One id per distinct error per day. The same crash reported by a thousand
 * people becomes one row with a count, not a thousand rows.
 */
export const fingerprint = (message, stack) => {
  const firstFrame = String(stack ?? "").split("\n").find((line) => /\bat\b|@/.test(line)) || "";
  return createHash("sha1").update(`${message}|${firstFrame.trim()}`).digest("hex").slice(0, 16);
};

export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

/** Turns whatever the browser sent into the one shape that is stored, or null. */
export const normalizeReport = (raw) => {
  if (!raw || typeof raw !== "object") return null;

  const message = clip(raw.message, LIMITS.message).trim();
  if (!message) return null;

  const stack = clip(raw.stack, LIMITS.stack);

  return {
    message,
    stack,
    source: clip(raw.source || "unknown", LIMITS.source),
    route: cleanRoute(raw.route),
    userAgent: clip(raw.userAgent, LIMITS.userAgent),
    fingerprint: fingerprint(message, stack),
  };
};
