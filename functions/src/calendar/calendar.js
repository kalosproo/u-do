import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";
import { logServerError } from "../errors/report.js";
import { buildCalendar, feedSignature, verifyFeed } from "./calendarCore.js";

/**
 * Calendar sync: a private .ics link per account that Google, Apple and
 * Outlook calendars subscribe to. Signed with the same secret as the email
 * unsubscribe links (under its own prefix), so it needs no new setup.
 *
 * calendarFeeds/{uid} holds only a version number. Resetting the link bumps
 * it, which invalidates every link signed for the old one. Nothing in the
 * app reads or writes that collection directly — the rules leave it closed.
 */

const LINK_SECRET = defineSecret("EMAIL_LINK_SECRET");

const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

const shift = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const feedUrl = (uid, version, secret) => {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "u-do-0";
  const signature = feedSignature(uid, version, secret);
  return `https://us-central1-${project}.cloudfunctions.net/calendarFeed?u=${encodeURIComponent(uid)}&v=${version}&s=${signature}`;
};

/** Returns this account's feed link, creating it on first use; `reset` issues a new one. */
export const getCalendarFeedUrl = onCall({ secrets: [LINK_SECRET] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const secret = LINK_SECRET.value();
  if (!secret) throw new HttpsError("failed-precondition", "Calendar sync isn't set up yet.");

  const uid = request.auth.uid;
  const ref = db.collection("calendarFeeds").doc(uid);
  const version = await db.runTransaction(async (tx) => {
    const current = Number((await tx.get(ref)).data()?.version) || 0;
    const next = request.data?.reset || current === 0 ? current + 1 : current;
    if (next !== current) tx.set(ref, { version: next, updatedAt: new Date() });
    return next;
  });

  return { url: feedUrl(uid, version, secret) };
});

/** The feed itself. Answers to any calendar app holding a valid link. */
export const calendarFeed = onRequest({ secrets: [LINK_SECRET] }, async (req, res) => {
  const uid = String(req.query.u || "");
  const version = Number(req.query.v);
  const signature = String(req.query.s || "");

  try {
    const stored = uid ? Number((await db.collection("calendarFeeds").doc(uid).get()).data()?.version) : NaN;
    if (!Number.isInteger(version) || version !== stored || !verifyFeed(uid, version, signature, LINK_SECRET.value())) {
      res.status(404).send("Not found");
      return;
    }

    const workspace = db.collection("users").doc(uid);
    const [examSnap, planSnap] = await Promise.all([
      workspace.collection("exams").where("date", ">=", shift(-PAST_DAYS)).get(),
      workspace.collection("planner").where("date", ">=", shift(-PAST_DAYS)).where("date", "<=", shift(FUTURE_DAYS)).get(),
    ]);

    const ics = buildCalendar({
      exams: examSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      plans: planSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });

    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Cache-Control", "private, max-age=900");
    res.set("Content-Disposition", 'inline; filename="u-do.ics"');
    res.status(200).send(ics);
  } catch (error) {
    await logServerError("calendarFeed", error);
    res.status(500).send("Try again later");
  }
});
