import { useEffect, useState } from "react";

/**
 * A short-lived "done — undo?" bar. Remount it (change its key) for each new
 * action so the countdown starts over. The parent owns the timer that makes
 * the action final; this only shows how long is left.
 */
function UndoToast({ leading, title, detail, duration, onUndo }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(duration / 1000));

  useEffect(() => {
    const endsAt = Date.now() + duration;
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [duration]);

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      {leading ? <span className="undo-toast-leading">{leading}</span> : null}
      <span className="undo-toast-text">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className="undo-toast-ring" aria-label={`${secondsLeft} seconds to undo`}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" className="undo-toast-ring-track" />
          <circle
            cx="18"
            cy="18"
            r="15"
            className="undo-toast-ring-bar"
            pathLength="100"
            style={{ animationDuration: `${duration}ms` }}
          />
        </svg>
        <span aria-hidden="true">{secondsLeft}</span>
      </span>
      <button type="button" className="undo-toast-button" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}

export default UndoToast;
