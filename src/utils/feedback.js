/**
 * A short tap of the phone's vibration motor when something gets done.
 *
 * Only on completing, never on undoing, and never for anyone who asked their
 * system for less motion. Browsers without a vibration motor (desktop, iOS
 * Safari) simply have no navigator.vibrate, so this does nothing there.
 */
export const celebrate = () => {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(12);
  } catch {
    /* A blocked vibration is not worth a console line. */
  }
};
