import crypto from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

initializeApp();

const db = getFirestore();

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const VERIFIED_TOKEN_EXPIRY_MS = 10 * 60 * 1000;
const EMAIL_DOMAIN = "@svce.edu.in";

const normalizeEmail = (value) => value.trim().toLowerCase();

const hashValue = (value) => crypto.createHash("sha256").update(value).digest("hex");

const generateOtp = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

const makeOtpHash = (otp, salt) => hashValue(`${salt}:${otp}`);

const nowTimestamp = () => Timestamp.fromMillis(Date.now());

const ensureAllowedEmail = (email) => {
  if (!email.endsWith(EMAIL_DOMAIN)) {
    throw new HttpsError("invalid-argument", "Only @svce.edu.in email addresses are allowed.");
  }
};

export const requestEmailOtp = onCall(async (request) => {
  const emailInput = request.data?.email;

  if (typeof emailInput !== "string" || !emailInput.trim()) {
    throw new HttpsError("invalid-argument", "A valid email is required.");
  }

  const email = normalizeEmail(emailInput);
  ensureAllowedEmail(email);

  const emailKey = hashValue(email);
  const stateRef = db.collection("emailOtpState").doc(emailKey);

  const now = Date.now();
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() : null;

  const cooldownUntil = state?.cooldownUntil?.toMillis?.() ?? 0;
  if (cooldownUntil > now) {
    throw new HttpsError("resource-exhausted", "Please wait before requesting another OTP.", {
      retryAfterMs: cooldownUntil - now,
    });
  }

  const otp = generateOtp();
  const salt = crypto.randomBytes(16).toString("hex");
  const otpHash = makeOtpHash(otp, salt);
  const challengeRef = db.collection("emailOtpChallenges").doc();
  const expiresAtMs = now + OTP_EXPIRY_MS;

  await challengeRef.set({
    email,
    otpHash,
    salt,
    createdAt: nowTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    attemptsRemaining: MAX_ATTEMPTS,
    status: "pending",
    verifiedAt: null,
    consumedAt: null,
  });

  await stateRef.set(
    {
      activeChallengeId: challengeRef.id,
      cooldownUntil: Timestamp.fromMillis(now + RESEND_COOLDOWN_MS),
      updatedAt: nowTimestamp(),
    },
    { merge: true },
  );

  logger.info("OTP challenge issued", { email, challengeId: challengeRef.id });

  const response = {
    challengeId: challengeRef.id,
    expiresAtMs,
    resendAvailableAtMs: now + RESEND_COOLDOWN_MS,
  };

  return response;
});

export const verifyEmailOtp = onCall(async (request) => {
  const emailInput = request.data?.email;
  const otpInput = request.data?.otp;
  const challengeId = request.data?.challengeId;

  if (typeof emailInput !== "string" || typeof otpInput !== "string" || typeof challengeId !== "string") {
    throw new HttpsError("invalid-argument", "Email, challengeId, and otp are required.");
  }

  const email = normalizeEmail(emailInput);
  ensureAllowedEmail(email);

  const challengeRef = db.collection("emailOtpChallenges").doc(challengeId);
  const challengeSnap = await challengeRef.get();

  if (!challengeSnap.exists) {
    throw new HttpsError("not-found", "OTP challenge not found.");
  }

  const challenge = challengeSnap.data();
  if (challenge.email !== email) {
    throw new HttpsError("permission-denied", "OTP challenge does not match this email.");
  }

  if (challenge.status !== "pending") {
    throw new HttpsError("failed-precondition", "OTP challenge already used. Please request a new OTP.");
  }

  const now = Date.now();
  const expiresAtMs = challenge.expiresAt.toMillis();
  if (expiresAtMs <= now) {
    await challengeRef.update({ status: "expired", updatedAt: nowTimestamp() });
    throw new HttpsError("deadline-exceeded", "OTP expired. Please request a new code.");
  }

  if (challenge.attemptsRemaining <= 0) {
    await challengeRef.update({ status: "locked", updatedAt: nowTimestamp() });
    throw new HttpsError("resource-exhausted", "Maximum OTP attempts exceeded. Request a new code.");
  }

  const expectedHash = makeOtpHash(otpInput.trim(), challenge.salt);
  if (expectedHash !== challenge.otpHash) {
    const nextAttempts = challenge.attemptsRemaining - 1;
    const nextStatus = nextAttempts <= 0 ? "locked" : "pending";

    await challengeRef.update({
      attemptsRemaining: nextAttempts,
      status: nextStatus,
      updatedAt: nowTimestamp(),
    });

    throw new HttpsError("invalid-argument", "Invalid OTP.", {
      attemptsRemaining: Math.max(nextAttempts, 0),
    });
  }

  const gateToken = crypto.randomBytes(32).toString("hex");
  const gateTokenHash = hashValue(gateToken);

  await challengeRef.update({
    status: "verified",
    verifiedAt: nowTimestamp(),
    gateTokenHash,
    gateTokenExpiresAt: Timestamp.fromMillis(now + VERIFIED_TOKEN_EXPIRY_MS),
    updatedAt: nowTimestamp(),
  });

  return {
    gateToken,
    gateTokenExpiresAtMs: now + VERIFIED_TOKEN_EXPIRY_MS,
  };
});

export const finalizeEmailOtpLogin = onCall(async (request) => {
  const authEmail = request.auth?.token?.email;
  const gateToken = request.data?.gateToken;
  const challengeId = request.data?.challengeId;

  if (!request.auth || !authEmail) {
    throw new HttpsError("unauthenticated", "You must be signed in to complete login.");
  }

  if (typeof gateToken !== "string" || typeof challengeId !== "string") {
    throw new HttpsError("invalid-argument", "gateToken and challengeId are required.");
  }

  const email = normalizeEmail(authEmail);
  const challengeRef = db.collection("emailOtpChallenges").doc(challengeId);
  const challengeSnap = await challengeRef.get();

  if (!challengeSnap.exists) {
    throw new HttpsError("not-found", "OTP challenge not found.");
  }

  const challenge = challengeSnap.data();

  if (challenge.email !== email) {
    throw new HttpsError("permission-denied", "OTP challenge email mismatch.");
  }

  if (challenge.status !== "verified") {
    throw new HttpsError("failed-precondition", "OTP has not been verified.");
  }

  if (challenge.consumedAt) {
    throw new HttpsError("already-exists", "OTP proof already consumed.");
  }

  const now = Date.now();
  const gateExpiresAtMs = challenge.gateTokenExpiresAt?.toMillis?.() ?? 0;
  if (gateExpiresAtMs <= now) {
    await challengeRef.update({ status: "expired", updatedAt: nowTimestamp() });
    throw new HttpsError("deadline-exceeded", "OTP verification window has expired.");
  }

  const incomingHash = hashValue(gateToken);
  if (incomingHash !== challenge.gateTokenHash) {
    throw new HttpsError("permission-denied", "Invalid OTP verification proof.");
  }

  await challengeRef.update({
    status: "consumed",
    consumedAt: nowTimestamp(),
    loginCompletedAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
    completedByUid: request.auth.uid,
    completedByEmail: email,
  });

  await db.collection("emailOtpAudit").add({
    challengeId,
    email,
    uid: request.auth.uid,
    completedAt: FieldValue.serverTimestamp(),
  });

  return { success: true };
});
