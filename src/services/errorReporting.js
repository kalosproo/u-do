import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

/**
 * Sends crashes to the admin console's error panel.
 *
 * Only for signed-in people, because the endpoint is: an open one would let
 * anyone fill the panel with junk. Bounded per page load, and the same message
 * is sent once, so a render loop is one report rather than a flood. The server
 * scrubs emails, long numbers and URL query strings and stores no account id.
 */

const MAX_PER_PAGE_LOAD = 10;
const sent = new Set();
let count = 0;
let call;

// Noise the app cannot act on: extensions injecting code, and a browser
// warning that fires on perfectly healthy layouts.
const IGNORED = [/ResizeObserver loop/i, /chrome-extension:\/\//i, /moz-extension:\/\//i, /safari-extension:\/\//i];

export const reportError = (error, { source = "app" } = {}) => {
  try {
    if (!auth?.currentUser) return;

    const message = String(error?.message || error || "").slice(0, 300);
    const stack = String(error?.stack || "").slice(0, 3000);
    if (!message || IGNORED.some((rule) => rule.test(message) || rule.test(stack))) return;

    const key = `${source}|${message}`;
    if (sent.has(key) || count >= MAX_PER_PAGE_LOAD) return;
    sent.add(key);
    count += 1;

    if (!call) call = httpsCallable(functions, "reportClientError");
    call({
      message,
      stack,
      source,
      route: window.location.pathname,
      userAgent: navigator.userAgent,
    }).catch(() => {
      // Reporting a failure must never become one.
    });
  } catch {
    /* Same. */
  }
};

/** Catches what no component boundary sees: thrown events and unhandled promises. */
export const installGlobalErrorReporting = () => {
  window.addEventListener("error", (event) => reportError(event.error || event.message, { source: "window" }));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason, { source: "promise" }));
};
