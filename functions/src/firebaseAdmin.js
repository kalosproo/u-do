import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * ESM evaluates every imported module before the importing module's own body,
 * so calling initializeApp() inside index.js would run *after* the admin
 * modules had already asked for Firestore. Putting the init here makes it a
 * shared dependency, which ESM guarantees is evaluated first and exactly once.
 */
if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
