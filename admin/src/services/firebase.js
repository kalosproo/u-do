import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

/**
 * Same Firebase project as the consumer app, separate bundle.
 *
 * Everything comes from env vars rather than being inlined, so the admin
 * deployment is configured independently of the consumer one and a misplaced
 * value in either project cannot silently point this app at the wrong data.
 *
 * The cost of that is a failure mode: this is a separate Vercel project, so it
 * needs its own copy of all six values, and initializeApp with an undefined
 * apiKey throws while this module is still evaluating — before React mounts,
 * which means a blank white page and an error only the console ever sees. So
 * the config is checked first and the app is left uninitialised when it is
 * incomplete, and main.jsx renders the reason instead.
 */
const REQUIRED = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Every VITE_FIREBASE_* var this build was given no value for. */
export const MISSING_ENV = Object.entries(REQUIRED)
  .filter(([, value]) => typeof value !== "string" || value.trim() === "")
  .map(([name]) => name);

const firebaseConfig = {
  apiKey: REQUIRED.VITE_FIREBASE_API_KEY,
  authDomain: REQUIRED.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: REQUIRED.VITE_FIREBASE_PROJECT_ID,
  storageBucket: REQUIRED.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: REQUIRED.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: REQUIRED.VITE_FIREBASE_APP_ID,
};

const app = MISSING_ENV.length === 0 ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
export const db = app ? getFirestore(app) : null;
export const functions = app ? getFunctions(app) : null;

// Local development against the emulator suite, which .env.example offers and
// nothing previously honoured.
if (app && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
