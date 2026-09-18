/**
 * Formatting shared by every screen.
 *
 * These were inline in Overview and would have been copied into each new page.
 * One definition means a timestamp reads the same everywhere, which matters
 * more here than usual: an operator comparing two screens is comparing numbers.
 */

/** Firestore timestamps arrive as objects from listeners and numbers from callables. */
export const toMillis = (value) => {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
};

export const timeAgo = (value) => {
  const millis = toMillis(value);
  if (!millis) return "—";

  const seconds = Math.round((Date.now() - millis) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const formatDate = (value) => {
  const millis = toMillis(value);
  return millis ? DATE.format(new Date(millis)) : "—";
};

export const formatCount = (value) =>
  typeof value === "number" ? value.toLocaleString("en-IN") : String(value ?? "—");

export const formatMoney = (value) => {
  if (!value || typeof value.amountMinor !== "number") return "—";
  const major = value.amountMinor / 100;
  return `${value.currency === "INR" ? "₹" : ""}${major.toLocaleString("en-IN")}`;
};

export const shortId = (uid) => (uid ? `${uid.slice(0, 6)}…` : "unknown");

/** A callable's HttpsError, reduced to the sentence worth showing. */
export const readableError = (error, fallback) =>
  error?.message || fallback || "Something went wrong.";
