import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";

/**
 * The AI assistant's only door to Groq.
 *
 * The key used to be VITE_GROQ_API_KEY, which Vite inlines into the browser
 * bundle — so it shipped to every visitor, extractable with view-source, and
 * anyone who found it could spend the quota. A key that reaches a browser is
 * not a secret, and no amount of obfuscation changes that. It lives here now,
 * as a Firebase secret the client never sees.
 *
 * Moving it server-side also closes a second hole that was easy to miss: the
 * old path required no account at all. A signed-out visitor could drive the
 * model straight from the console. This callable requires auth and meters per
 * account.
 */

const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/** Big enough for a whole workspace snapshot, small enough to bound the bill. */
const MAX_PROMPT_CHARS = 24_000;

/** Abuse braking, not a plan quota — the Free/Pro limits are a separate call. */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_CALLS_PER_WINDOW = 30;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryable = (status) => status === 429 || (status >= 500 && status < 600);

/**
 * Counts this account's calls in a rolling hour.
 *
 * Deliberately not the `usageCounters` plan quota. Enforcing Free's 5-per-month
 * would silently cut off people who use the assistant today, and what Pro costs
 * has not been decided — that is a product call, not a security one. This only
 * stops one account burning the key.
 */
const meter = async (uid) => {
  const ref = db.collection("aiUsage").doc(uid);
  const now = Date.now();

  const allowed = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.exists ? snap.data() : {};
    const windowStart = data.windowStart || 0;
    const fresh = now - windowStart > WINDOW_MS;
    const used = fresh ? 0 : data.count || 0;

    if (used >= MAX_CALLS_PER_WINDOW) return false;

    transaction.set(
      ref,
      {
        uid,
        count: used + 1,
        windowStart: fresh ? now : windowStart,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  });

  if (!allowed) {
    throw new HttpsError(
      "resource-exhausted",
      "You've used the assistant a lot in the last hour. Try again shortly.",
    );
  }
};

export const askAssistant = onCall(
  { secrets: [GROQ_API_KEY], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to use the assistant.");
    }

    const prompt = typeof request.data?.prompt === "string" ? request.data.prompt : "";

    if (!prompt.trim()) {
      throw new HttpsError("invalid-argument", "Nothing to ask.");
    }

    if (prompt.length > MAX_PROMPT_CHARS) {
      throw new HttpsError("invalid-argument", "That request is too large to send.");
    }

    const key = GROQ_API_KEY.value();
    if (!key) {
      console.error("askAssistant: GROQ_API_KEY secret is not set");
      throw new HttpsError("failed-precondition", "The assistant is not configured yet.");
    }

    await meter(request.auth.uid);

    let lastStatus = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response;

      try {
        response = await fetch(API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || DEFAULT_MODEL,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
          }),
        });
      } catch (error) {
        // A network fault, not an answer. Retry, then give up quietly.
        console.error("askAssistant: request failed", error);
        if (attempt === MAX_RETRIES) break;
        await wait(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }

      if (response.ok) {
        const body = await response.json();
        return { text: body?.choices?.[0]?.message?.content ?? "" };
      }

      lastStatus = response.status;

      // Whatever Groq says goes to our logs, never to the browser: an upstream
      // error body can carry key fragments, org ids and quota details.
      console.error(`askAssistant: Groq returned ${response.status}`, await response.text());

      if (!retryable(response.status) || attempt === MAX_RETRIES) break;

      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BASE_DELAY_MS * 2 ** attempt,
      );
    }

    throw new HttpsError(
      lastStatus === 429 ? "resource-exhausted" : "unavailable",
      lastStatus === 429
        ? "The assistant is busy right now. Try again in a moment."
        : "The assistant could not be reached. Try again in a moment.",
    );
  },
);
