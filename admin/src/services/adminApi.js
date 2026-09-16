import { httpsCallable } from "firebase/functions";

import { functions } from "./firebase.js";

/**
 * Thin wrappers over the admin callables. Anything that reads another person's
 * account, or changes state, goes through here rather than through Firestore
 * directly — the browser never holds the privilege to do it itself.
 */
const call = (name) => async (payload = {}) => {
  const fn = httpsCallable(functions, name);
  const result = await fn(payload);
  return result.data;
};

export const getAdminIdentity = call("getAdminIdentity");
export const getAdminOverview = call("getAdminOverview");
export const listAdminUsers = call("listAdminUsers");
export const findAdminUser = call("findAdminUser");
export const getAdminUserDetail = call("getAdminUserDetail");
export const setAdminClaim = call("setAdminClaim");
export const seedPlanLimits = call("seedPlanLimits");
export const backfillBilling = call("backfillBilling");
