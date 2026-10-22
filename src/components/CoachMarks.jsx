import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../hooks/useAuth";
import { markSeen, pendingTips, placeBubble, readState, turnOff } from "../utils/coachMarks";

const keyFor = (uid) => `u_do_tips_${uid}`;
const CHECK_MS = 700;
// Nothing points at the page while something sits on top of it.
const BLOCKERS = ".modal-overlay, .tour-overlay, .autoplan-overlay, .focus-screen, .agreement-overlay, .consent-overlay";

const load = (uid) => {
  try {
    return readState(localStorage.getItem(keyFor(uid)));
  } catch {
    return readState(null);
  }
};

const save = (uid, state) => {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(state));
  } catch {
    /* Tips may reappear next visit; nothing breaks. */
  }
};

/** The first element for a tip that is actually on screen right now. */
const findTarget = (id) => {
  for (const element of document.querySelectorAll(`[data-tip="${id}"]`)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top >= 56 && rect.bottom <= window.innerHeight) return element;
  }
  return null;
};

/**
 * One-time arrow tips: a small bubble pointing at a real control the first
 * time it is on screen. One at a time; any tap dismisses it for good, and
 * "Skip tips" turns the rest off.
 */
function CoachMarks() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [state, setState] = useState(() => (uid ? load(uid) : null));
  const [active, setActive] = useState(null);
  const [pos, setPos] = useState(null);
  const bubbleRef = useRef(null);
  const targetRef = useRef(null);
  const skipRef = useRef(null);

  // Reload when the account changes.
  const [loadedFor, setLoadedFor] = useState(uid);
  if (uid !== loadedFor) {
    setLoadedFor(uid);
    setState(uid ? load(uid) : null);
    setActive(null);
  }

  const update = useCallback(
    (next) => {
      setState(next);
      if (uid) save(uid, next);
    },
    [uid]
  );

  // Look for the next tip whose control is on screen; follow the shown one.
  useEffect(() => {
    if (!uid || !state) return undefined;
    const timer = setInterval(() => {
      if (document.querySelector(BLOCKERS)) {
        setActive(null);
        return;
      }
      if (active) {
        if (!targetRef.current?.isConnected || !findTarget(active.id)) setActive(null);
        return;
      }
      for (const tip of pendingTips(state)) {
        const element = findTarget(tip.id);
        if (element) {
          targetRef.current = element;
          setActive(tip);
          return;
        }
      }
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, [uid, state, active]);

  // Position the bubble against the target, and keep it there.
  useLayoutEffect(() => {
    if (!active) return undefined;
    const place = () => {
      const target = targetRef.current;
      const bubble = bubbleRef.current;
      if (!target || !bubble) return;
      setPos(
        placeBubble(target.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, {
          width: bubble.offsetWidth,
          height: bubble.offsetHeight,
        })
      );
    };
    place();
    targetRef.current?.setAttribute("data-tip-active", "");
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const target = targetRef.current;
    return () => {
      target?.removeAttribute("data-tip-active");
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      setPos(null);
    };
  }, [active]);

  // Any tap dismisses the tip (and still does what it was meant to do).
  useEffect(() => {
    if (!active) return undefined;
    const dismiss = (event) => {
      if (skipRef.current?.contains(event.target)) update(turnOff(state));
      else update(markSeen(state, active.id));
      setActive(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") dismiss(event);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, state, update]);

  if (!active) return null;

  return createPortal(
    <div
      ref={bubbleRef}
      className={`coach-mark ${pos ? `is-${pos.side}` : "is-measuring"}`}
      role="status"
      style={pos ? { top: pos.top, left: pos.left, "--arrow-x": `${pos.arrowX}px` } : undefined}
    >
      <p>{active.text}</p>
      <button ref={skipRef} type="button" className="coach-mark-skip">
        Skip tips
      </button>
    </div>,
    document.body
  );
}

export default CoachMarks;
