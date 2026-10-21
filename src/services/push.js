import { deleteField, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";
import { httpsCallable } from "firebase/functions";

import { app, db, functions } from "./firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const WORKER_PATH = "/firebase-messaging-sw.js";

const subscriptionDoc = (uid) => doc(db, "pushSubscriptions", uid);

export const DEFAULT_PUSH_TYPES = Object.freeze({
  tasks: true,
  habits: true,
  planner: true,
  friends: true,
});

/**
 * The window reminders are allowed to run in.
 *
 * Two times rather than one, because these repeat now. "Every 30 minutes until
 * it is done" without an end is a notification at 3am, and the fastest way for
 * a person to block the app entirely.
 */
export const DEFAULT_PUSH_START = "08:00";
export const DEFAULT_PUSH_END = "21:00";

/** Older records stored a single `time`; it becomes the start of the window. */
export const readWindow = (subscription) => ({
  start: subscription?.start || subscription?.time || DEFAULT_PUSH_START,
  end: subscription?.end || DEFAULT_PUSH_END,
});

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
export const enablePush = async (
  uid,
  { start = DEFAULT_PUSH_START, end = DEFAULT_PUSH_END, types = DEFAULT_PUSH_TYPES } = {},
) => {
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
      start,
      end,
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

/**
 * Re-registers this device without asking anything, when permission was
 * already given.
 *
 * Two things made reminders silently stop. Push is switched on per account
 * but delivered per device, so turning it on from a laptop left the phone
 * showing "on" with no token of its own. And FCM rotates tokens: the server
 * prunes the dead one, and with nothing re-registering, the account ends up
 * with no devices at all. Calling this on every visit fixes both — getToken
 * returns the current token, and the merge adds it if it is new.
 *
 * Returns "registered", "needs-permission" or "unavailable".
 */
export const syncThisDevice = async (uid) => {
  if (!uid || typeof Notification === "undefined") return "unavailable";
  if (Notification.permission !== "granted") return "needs-permission";

  try {
    const registration = await registerMessagingWorker();
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return "unavailable";

    await setDoc(
      subscriptionDoc(uid),
      {
        uid,
        tokens: { [token]: true },
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return "registered";
  } catch {
    return "unavailable";
  }
};

/**
 * Asks the server to push a test notification to every registered device
 * right now — the quickest way to see which link in the chain is broken.
 */
export const sendTestPush = async () => {
  try {
    const { data } = await httpsCallable(functions, "sendTestPush")({});
    return { ok: true, ...data };
  } catch (error) {
    const code = String(error?.code || "");
    if (code.includes("not-found") || code.includes("internal") || code.includes("unavailable")) {
      return { ok: false, reason: "server" };
    }
    if (code.includes("resource-exhausted")) return { ok: false, reason: "too-soon" };
    return { ok: false, reason: "unknown", message: error?.message };
  }
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

export const savePushPreferences = (uid, { start, end, types }) =>
  setDoc(
    subscriptionDoc(uid),
    { uid, start, end, types, updatedAt: serverTimestamp() },
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
