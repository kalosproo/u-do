import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { db } from "../firebaseAdmin.js";
import { dayKey, fingerprint, normalizeReport, redact } from "./scrub.js";

/**
 * Crash reporting into the errorLogs collection the admin Overview already
 * reads — it has had an "errors" panel since it was built, and nothing ever
 * wrote to it, so a crash anywhere was invisible unless someone complained.
 *
 * Built in-house rather than with a crash-reporting service: no new company
 * receives anyone's data, and no account to sign up for.
 */

const MAX_REPORTS_PER_HOUR = 20;
const RETENTION_DAYS = 30;

const write = async (entry, severity) => {
  const ref = db.collection("errorLogs").doc(`${entry.fingerprint}_${dayKey()}`);

  // createdAt moves with every occurrence so a recurring error stays at the
  // top of the Overview, which orders by it; firstSeenAt keeps the start.
  const latest = { ...entry, severity, createdAt: FieldValue.serverTimestamp() };

  try {
    await ref.create({ ...latest, count: 1, firstSeenAt: FieldValue.serverTimestamp() });
  } catch (error) {
    if (error?.code !== 6) throw error; // ALREADY_EXISTS: seen before today
    await ref.update({ ...latest, count: FieldValue.increment(1) });
  }
};

/** At most MAX_REPORTS_PER_HOUR from one account, so a crash loop is one row, not a flood. */
const withinLimit = (uid) =>
  db.runTransaction(async (transaction) => {
    const ref = db.collection("errorRate").doc(uid);
    const snap = await transaction.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : {};
    const fresh = now - (data.windowStart || 0) > 3_600_000;
    const used = fresh ? 0 : data.count || 0;
    if (used >= MAX_REPORTS_PER_HOUR) return false;
    transaction.set(ref, { count: used + 1, windowStart: fresh ? now : data.windowStart });
    return true;
  });

/**
 * Signed-in only. An open endpoint would let anyone fill the admin's error
 * panel with junk; behind auth it is bounded per account.
 */
export const reportClientError = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const entry = normalizeReport(request.data);
  if (!entry) return { ok: false };

  if (!(await withinLimit(request.auth.uid))) return { ok: false, limited: true };

  await write(entry, "error");
  return { ok: true };
});

/**
 * For the server's own failures. Never throws: reporting an error must not
 * become a second one.
 */
export const logServerError = async (source, error, severity = "critical") => {
  try {
    const message = redact(error?.message || String(error)).slice(0, 300) || "Unknown server error";
    const stack = redact(error?.stack || "").slice(0, 3000);
    await write({ message, stack, source: `server:${source}`.slice(0, 40), route: "", userAgent: "", fingerprint: fingerprint(message, stack) }, severity);
  } catch (logError) {
    console.error("logServerError failed", logError);
  }
};

/** Error reports are kept for 30 days, as the privacy policy says. */
export const pruneErrorLogs = onSchedule({ schedule: "every 24 hours", timeZone: "Asia/Kolkata" }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_DAYS * 86_400_000);
  let removed = 0;

  for (;;) {
    const snap = await db.collection("errorLogs").where("createdAt", "<", cutoff).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.size;
  }

  console.log(`pruneErrorLogs: removed ${removed}`);
});
