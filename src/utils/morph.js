import { flushSync } from "react-dom";

/**
 * Runs a state change as a view transition, so what moves glides to its new
 * place instead of jumping: a task rising from "Up next" into "Now", a
 * finished one settling into the done list. Browsers without view
 * transitions, and anyone who asked for less motion, get the change at once.
 */
export const morph = (update) => {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (typeof document === "undefined" || !document.startViewTransition || reduce) {
    update();
    return;
  }
  try {
    document.startViewTransition(() => flushSync(update));
  } catch {
    update();
  }
};

/** A view-transition-name for one task, safe whatever its id holds. */
export const morphName = (id) => `adhd-t-${String(id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
