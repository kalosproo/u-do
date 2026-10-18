import { useLocation } from "react-router-dom";
import { FiPause, FiPlay } from "react-icons/fi";

import { useFocus } from "../../hooks/useFocus";
import { formatClock } from "../../utils/focusTimer";

/**
 * The timer, small, while you're elsewhere in the app. Tap it to go back to
 * the full screen. Hidden on Home, where the Focus card already shows it.
 */
function FocusPill() {
  const focus = useFocus();
  const { pathname } = useLocation();
  if (!focus?.session || focus.view === "full" || pathname === "/") return null;

  const { session } = focus;
  const label = session.phase === "break" ? "Break" : session.subject || "Focus";

  return (
    <div className={`focus-pill ${session.paused ? "is-paused" : ""}`} role="status">
      <button type="button" className="focus-pill-open" onClick={focus.open} aria-label="Open focus timer">
        <span className="focus-pill-dot" aria-hidden="true" />
        <strong>{formatClock(focus.remaining)}</strong>
        <span className="focus-pill-label">{label}</span>
      </button>
      <button
        type="button"
        className="focus-pill-toggle"
        onClick={focus.toggle}
        aria-label={session.paused ? "Resume" : "Pause"}
      >
        {session.paused ? <FiPlay /> : <FiPause />}
      </button>
    </div>
  );
}

export default FocusPill;
