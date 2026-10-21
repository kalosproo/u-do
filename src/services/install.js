/**
 * Installing U.Do to the home screen.
 *
 * Chrome and Edge on Android fire `beforeinstallprompt`; it is kept here (the
 * listener is registered when this module first loads, from main.jsx) so a
 * button can show the browser's own install dialog later. Safari on iPhone
 * has no such event — there the app explains Share → Add to Home Screen.
 */

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const subscribeInstall = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isInstalled = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const canPromptInstall = () => Boolean(deferred);

/** Shows the browser's install dialog. Resolves true if the person installed. */
export const promptInstall = async () => {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  notify();
  event.prompt();
  const choice = await event.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
};
