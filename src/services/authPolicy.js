import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const authorizeAuthAttemptCallable = httpsCallable(functions, "authorizeAuthAttempt");

export const POLICY_CODES = {
  INVALID_EMAIL: "INVALID_EMAIL",
  DISPOSABLE_EMAIL_BLOCKED: "DISPOSABLE_EMAIL_BLOCKED",
  DOMAIN_NOT_ALLOWED: "DOMAIN_NOT_ALLOWED",
  RATE_LIMITED: "RATE_LIMITED",
};

export const getBrowserDeviceId = () => {
  const storageKey = "udo-device-id";
  const existing = localStorage.getItem(storageKey);

  if (existing) return existing;

  const deviceId = crypto?.randomUUID?.() || `device-${Date.now()}`;
  localStorage.setItem(storageKey, deviceId);
  return deviceId;
};

export const authorizeAuthAttempt = async ({ email, mode }) => {
  try {
    const deviceId = getBrowserDeviceId();
    const response = await authorizeAuthAttemptCallable({ email, mode, deviceId });

    return response.data;
  } catch (err) {
    const policyCode = err?.details?.policyCode;

    if (policyCode) {
      const error = new Error("Policy check failed.");
      error.policyCode = policyCode;
      throw error;
    }

    throw err;
  }
};
