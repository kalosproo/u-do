import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { db } from "../firebaseAdmin.js";
import { logServerError } from "../errors/report.js";
import { gatherWork, localDateKey, localMinutes } from "../notifications/digest.js";
import { composeDigest, isSendTime, minutesOfTime, unsubscribeSignature, verifyUnsubscribe } from "./emailCore.js";

/**
 * The opt-in morning summary email, sent through Resend.
 *
 * Off until configured: it needs RESEND_API_KEY, a sender in EMAIL_FROM on a
 * domain verified with Resend, and EMAIL_LINK_SECRET to sign unsubscribe
 * links. Without them the schedule runs and sends nothing.
 *
 * Only to addresses that are confirmed (or come from Google), only when there
 * is something due, at most once a day, and every email carries a one-click
 * unsubscribe that works without signing in.
 */

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const EMAIL_LINK_SECRET = defineSecret("EMAIL_LINK_SECRET");
const EMAIL_FROM = defineString("EMAIL_FROM", { default: "" });

const unsubscribeUrl = (uid) => {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "u-do-0";
  const signature = unsubscribeSignature(uid, EMAIL_LINK_SECRET.value());
  return `https://us-central1-${project}.cloudfunctions.net/emailUnsubscribe?u=${encodeURIComponent(uid)}&s=${signature}`;
};

const sendEmail = async ({ to, subject, html, text, unsubscribe }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY.value()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM.value(),
      to: [to],
      subject,
      html,
      text,
      headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 200)}`);
  }
};

const deliverable = (account) =>
  Boolean(account?.email) &&
  !account.disabled &&
  (account.emailVerified || (account.providerData || []).some((p) => p.providerId === "google.com"));

export const sendEmailDigests = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Etc/UTC", timeoutSeconds: 540, secrets: [RESEND_API_KEY, EMAIL_LINK_SECRET] },
  async () => {
    if (!RESEND_API_KEY.value() || !EMAIL_FROM.value() || EMAIL_LINK_SECRET.value().length < 16) {
      console.log("sendEmailDigests: email isn't configured; nothing sent");
      return;
    }

    const now = new Date();
    const snapshot = await db.collection("emailPrefs").where("daily", "==", true).get();
    let sent = 0;

    for (const entry of snapshot.docs) {
      const uid = entry.id;
      const prefs = entry.data();
      const timeZone = prefs.timeZone || "Asia/Kolkata";

      try {
        const dayKey = localDateKey(now, timeZone);
        if (prefs.lastSentDay === dayKey) continue;
        if (!isSendTime(localMinutes(now, timeZone), minutesOfTime(prefs.time))) continue;

        const account = await getAuth().getUser(uid).catch(() => null);
        if (!deliverable(account)) continue;

        const work = await gatherWork(uid, dayKey, { tasks: true, habits: true, planner: true });
        const unsubscribe = unsubscribeUrl(uid);
        const email = composeDigest({ name: account.displayName, ...work, unsubscribeUrl: unsubscribe });

        // Marked even when there was nothing to say, so the next run doesn't look again.
        await entry.ref.set({ lastSentDay: dayKey }, { merge: true });
        if (!email) continue;

        await sendEmail({ to: account.email, ...email, unsubscribe });
        sent += 1;
      } catch (error) {
        await logServerError("sendEmailDigests", error);
      }
    }

    console.log(`sendEmailDigests: ${sent} sent`);
  }
);

const page = (title, body) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f2;font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif">
<main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#9a9a9a">${body}</p>
<p><a href="https://u-do-sigma.vercel.app/profile" style="color:#f2f2f2">Open U.Do</a></p></main></body></html>`;

/**
 * The link at the bottom of every summary. Works without signing in, from the
 * link (GET) or from the mail app's one-click unsubscribe (POST).
 */
export const emailUnsubscribe = onRequest({ secrets: [EMAIL_LINK_SECRET] }, async (req, res) => {
  const uid = String(req.query.u || "");
  const signature = String(req.query.s || "");

  if (!verifyUnsubscribe(uid, signature, EMAIL_LINK_SECRET.value())) {
    res.status(400).send(page("That link didn't work", "It may have been copied incompletely. You can turn the summary off in Profile → Reminders."));
    return;
  }

  try {
    await db.collection("emailPrefs").doc(uid).set({ daily: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.status(200).send(page("You're unsubscribed", "You won't get the daily summary any more. You can turn it back on in Profile → Reminders."));
  } catch (error) {
    await logServerError("emailUnsubscribe", error);
    res.status(500).send(page("Something went wrong", "Please try the link again in a moment."));
  }
});
