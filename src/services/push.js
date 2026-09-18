import { deleteField, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";

import { app, db } from "./firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const WORKER_PATH = "/firebase-messaging-sw.js";

const subscriptionDoc = (uid) => doc(db, "pushSubscriptions", uid);

export const DEFAULT_PUSH_TYPES = Object.freeze({
  digest: true,
  habits: true,
  tasks: true,
  friends: true,
});

export const DEFAULT_PUSH_TIME = "08:00";

/**
 * Why push might be unavailable, in the order a person would want to hear it.
 *
 * Returned as a reason rather than a boolean because every one of these has a
 * different answer, and a toggle that is simply greyed out teaches nobody
 * anything. `ios-not-installed` is the one that matters most: Safari delivers
 * no web push at all until the site is on the Home Screen, so an iPhone user
 * who is never told that will conclude the feature is broken.
 */
export const pushAvailability = async () => {
  if (typeof window === "undefined") return "unsupported";
  if (!VAPID_KEY) return "not-configured";
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return "unsupported";

  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (iOS && !installed) return "ios-not-installed";

  try {
    return (await isSupported()) ? "available" : "unsupported";
  } catch {
    return "unsupported";
  }
};

/**
 * The worker is registered with the config on its query string, because a
 * service worker has no build step and cannot read import.meta.env. The key is
 * a public identifier — security rules are what protect the data.
 */
const registerMessagingWorker = () => {
  const params = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    appId: "1:368334460810:web:7e7f32bb47c1f6a2d81a73",
  });

  return navigator.serviceWorker.register(`${WORKER_PATH}?${params}`, { scope: "/" });
};

/**
 * Asks for permission, takes a token, and stores it.
 *
 * Tokens are kept in a map keyed by token rather than an array, so the same
 * device registering twice cannot duplicate itself and a dead one can be
 * removed by the server with a single field delete.
 */
export const enablePush = async (uid, { time = DEFAULT_PUSH_TIME, types = DEFAULT_PUSH_TYPES } = {}) => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };

  const registration = await registerMessagingWorker();
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) return { ok: false, reason: "no-token" };

  await setDoc(
    subscriptionDoc(uid),
    {
      uid,
      enabled: true,
      time,
      types,
      // The zone, not an offset: an offset saved in January is wrong in July
      // anywhere that observes DST, and the server can derive the offset from
      // the zone whenever it needs it.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
      tokens: { [token]: true },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true, token };
};

/** Drops this device's token and stops the schedule for the account. */
export const disablePush = async (uid) => {
  let token = null;

  try {
    const messaging = getMessaging(app);
    token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(() => null);
    if (token) await deleteToken(messaging);
  } catch {
    // The token may already be gone. The record still has to be updated.
  }

  await setDoc(
    subscriptionDoc(uid),
    {
      uid,
      enabled: false,
      ...(token ? { tokens: { [token]: deleteField() } } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true };
};

export const savePushPreferences = (uid, { time, types }) =>
  setDoc(
    subscriptionDoc(uid),
    { uid, time, types, updatedAt: serverTimestamp() },
    { merge: true },
  );

export const fetchPushSubscription = async (uid) => {
  if (!uid) return null;

  try {
    const snapshot = await getDoc(subscriptionDoc(uid));
    return snapshot.exists() ? snapshot.data() : null;
  } catch {
    return null;
  }
};
