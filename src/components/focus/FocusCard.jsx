import { FiMaximize2, FiPause, FiPlay } from "react-icons/fi";

import { useFocus } from "../../hooks/useFocus";
import { PRESETS, formatClock, formatMinutes } from "../../utils/focusTimer";
import { toDateKey } from "../../utils/dateKeys";

/**
 * Focus, on Home: pick a length, say what it's for if you like, start.
 * Opt-in — it is its own study mode, not attached to every task. While a
 * session runs the card shows it live and opens the full screen.
 */
function FocusCard() {
  const focus = useFocus();
  if (!focus) return null;

  const { session, setup } = focus;
  const today = focus.log[toDateKey(new Date())]?.minutes || 0;

  return (
    <section className="panel focus-card" aria-label="Focus timer">
      <div className="focus-card-head">
        <div>
          <p className="eyebrow">FOCUS</p>
          <h3 className="focus-card-title">{session ? (session.phase === "break" ? "On a break" : session.subject || "Focusing") : "Study without distractions."}</h3>
        </div>
        <span className="panel-note">{formatMinutes(today)} today</span>
      </div>

      {session ? (
        <>
          <strong className="focus-card-time">{formatClock(focus.remaining)}</strong>
          <div className="focus-card-actions">
            <button type="button" className="btn btn-primary" onClick={focus.open}>
              <FiMaximize2 /> Open
            </button>
            <button type="button" className="btn" onClick={focus.toggle}>
              {session.paused ? <FiPlay /> : <FiPause />} {session.paused ? "Resume" : "Pause"}
            </button>
            <button type="button" className="btn" onClick={focus.stop}>
              End
            </button>
          </div>
        </>
      ) : (
        <>
          <strong className="focus-card-time">{formatClock(setup.minutes * 60_000)}</strong>
          <div className="focus-presets" role="group" aria-label="Length">
            {PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`chip ${setup.minutes === minutes ? "active" : ""}`}
                aria-pressed={setup.minutes === minutes}
                onClick={() => focus.setSetup({ minutes })}
              >
                {minutes} min
              </button>
            ))}
          </div>
          <input
            className="focus-card-input"
            placeholder="What are you studying? (optional)"
            value={setup.subject}
            maxLength={80}
            onChange={(event) => focus.setSetup({ subject: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") focus.start();
            }}
          />
          <button type="button" className="btn btn-primary focus-card-start" onClick={() => focus.start()}>
            <FiPlay /> Start focus
          </button>
        </>
      )}
    </section>
  );
}

export default FocusCard;
