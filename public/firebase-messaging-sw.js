/* eslint-env serviceworker */
/* global importScripts, firebase */

/**
 * The background half of push.
 *
 * A service worker is a separate script with no build step and no access to
 * import.meta.env, so the config cannot be inlined the way src/services/
 * firebase.js does it. The API key arrives on the registration URL instead —
 * see registerMessagingWorker in src/services/push.js. A Firebase web API key
 * is a public identifier, not a secret; what protects the data is the security
 * rules, which is why this is safe to read off a query string.
 *
 * The compat builds are used because importScripts cannot load ES modules in
 * a classic worker, and a classic worker is what FCM registers.
 */
importScripts("https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);

firebase.initializeApp({
  apiKey: params.get("apiKey") || "",
  authDomain: "u-do-0.firebaseapp.com",
  projectId: "u-do-0",
  storageBucket: "u-do-0.firebasestorage.app",
  messagingSenderId: "368334460810",
  appId: params.get("appId") || "",
});

const messaging = firebase.messaging();

/**
 * Only reached for a data-only message. A message carrying a `notification`
 * block is displayed by the browser itself, and handling it here as well would
 * show the same reminder twice — the classic duplicate-notification bug.
 */
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  if (!data.title) return;

  self.registration.showNotification(data.title, {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "u-do",
    // A reminder that arrives while you are already looking at something else
    // should not stack; the newest one replaces the last.
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  });
});

// Tapping a reminder should land on the page it is about, and should reuse an
// open U.Do tab rather than opening a third copy of the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
