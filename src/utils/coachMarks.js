/**
 * One-time arrow tips. Each points at a real control the first time it is on
 * screen, one at a time, and never again once dismissed. Pure helpers; the
 * component does the DOM work.
 */

export const TIPS = [
  { id: "capture", text: "Add anything in one tap — a task, a plan, a note." },
  { id: "focus", text: "Start a 25-minute study session." },
  { id: "steps", text: "Tap a task to break it into small steps." },
  { id: "revision", text: "Spread your chapters out before an exam." },
  { id: "room", text: "Study live with friends — one timer for everyone." },
];

export const EMPTY_STATE = { seen: [], off: false };

export const readState = (raw) => {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      seen: Array.isArray(parsed?.seen) ? parsed.seen.filter((id) => typeof id === "string") : [],
      off: parsed?.off === true,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
};

/** The tips still to show, in order. */
export const pendingTips = (state) => (state.off ? [] : TIPS.filter((tip) => !state.seen.includes(tip.id)));

export const markSeen = (state, id) => (state.seen.includes(id) ? state : { ...state, seen: [...state.seen, id] });

export const turnOff = (state) => ({ ...state, off: true });

/**
 * Where the bubble goes: below the target when there's room, otherwise above.
 * The arrow's x stays over the target's centre even when the bubble is
 * pushed in from the screen edge.
 */
export const placeBubble = (rect, viewport, bubble, gap = 12, margin = 12) => {
  const below = rect.bottom + gap + bubble.height <= viewport.height - margin;
  const top = below ? rect.bottom + gap : rect.top - gap - bubble.height;
  const centre = rect.left + rect.width / 2;
  const left = Math.min(Math.max(centre - bubble.width / 2, margin), viewport.width - bubble.width - margin);
  return { top, left, side: below ? "below" : "above", arrowX: Math.min(Math.max(centre - left, 16), bubble.width - 16) };
};
