import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FiBookOpen, FiChevronDown, FiPause, FiPlay, FiRotateCcw, FiSkipForward } from "react-icons/fi";

import { useFocus } from "../../hooks/useFocus";
import { formatClock, formatMinutes, lastDays, progressOf } from "../../utils/focusTimer";
import { toDateKey } from "../../utils/dateKeys";

const STYLES = [
  [1, "Ring"],
  [2, "Clock"],
];

function Ring({ progress }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg className="focus-ring-svg" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="focus-ring-track" />
      <circle cx="50" cy="50" r={r} className="focus-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
    </svg>
  );
}

function Week({ log }) {
  const days = lastDays(log, 7);
  const top = Math.max(25, ...days.map((d) => d.minutes));
  return (
    <div className="focus-week" aria-hidden="true">
      {days.map((day, i) => (
        <span key={day.key} className={i === days.length - 1 ? "is-today" : ""} style={{ height: `${Math.max(6, (day.minutes / top) * 100)}%` }} />
      ))}
    </div>
  );
}

/**
 * The full-screen timer. Style 1 is the ring with controls and the week's
 * bars; style 2 is a big clock and nothing else, tap anywhere to pause.
 * Switched with the 1 / 2 control at the top, like the theme, and both lay
 * themselves out for landscape on a tablet or a phone turned sideways.
 */
function FocusScreen() {
  const focus = useFocus();
  const { session, view, style } = focus || {};
  const visible = Boolean(focus && view === "full" && session);

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea, select")) return;
      if (event.key === "Escape") focus.minimize();
      if (event.key === " ") {
        event.preventDefault();
        focus.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("is-focusing");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("is-focusing");
    };
  }, [visible, focus]);

  if (!visible) return null;

  const isBreak = session.phase === "break";
  const total = (isBreak ? session.breakMinutes : session.minutes) * 60_000;
  const progress = progressOf({ ...session, minutes: total / 60_000 }, focus.now);
  const time = formatClock(focus.remaining);
  const today = focus.log[toDateKey(new Date())] || { minutes: 0, sessions: 0 };
  const sessionNo = (session.count || 0) + (isBreak ? 0 : 1);
  const eyebrow = isBreak ? "BREAK" : `FOCUS · SESSION ${sessionNo}`;
  const playLabel = session.paused ? (isBreak ? "Resume break" : "Start") : "Pause";

  const switcher = (
    <div className="focus-style" role="group" aria-label="Timer style">
      {STYLES.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={style === value ? "is-active" : ""}
          aria-pressed={style === value}
          title={label}
          onClick={() => focus.setStyle(value)}
        >
          {value}
        </button>
      ))}
    </div>
  );

  const top = (
    <header className="focus-top">
      <button type="button" className="focus-icon-btn" onClick={focus.minimize} aria-label="Minimise timer" title="Minimise (Esc)">
        <FiChevronDown />
      </button>
      {/* Style 2 says what's happening in the middle of the screen instead. */}
      <span className="eyebrow">{style === 1 ? eyebrow : ""}</span>
      {switcher}
    </header>
  );

  return createPortal(
    <div className={`focus-screen focus-style-${style} ${isBreak ? "is-break" : ""}`} role="dialog" aria-modal="true" aria-label="Focus timer">
      {style === 1 ? (
        <>
          {top}
          <div className="focus-a">
            <div className="focus-a-dial">
              {session.subject ? (
                <span className="focus-chip">
                  <FiBookOpen aria-hidden="true" /> {session.subject}
                </span>
              ) : null}
              <div className="focus-ring">
                <Ring progress={progress} />
                <div className="focus-ring-label">
                  <strong className="focus-time" aria-live="off">{time}</strong>
                  <span>
                    of {formatClock(total)} · {isBreak ? "break" : "focus"}
                  </span>
                </div>
              </div>
            </div>

            <div className="focus-a-side">
              <div className="focus-controls">
                <button type="button" className="focus-round" onClick={focus.reset} aria-label="Restart this part">
                  <FiRotateCcw />
                </button>
                <button type="button" className="focus-main" onClick={focus.toggle} aria-label={playLabel}>
                  {session.paused ? <FiPlay /> : <FiPause />}
                </button>
                <button type="button" className="focus-round" onClick={focus.skip} aria-label={isBreak ? "Skip break" : "Finish now"}>
                  <FiSkipForward />
                </button>
              </div>

              <footer className="focus-stats">
                <div>
                  <small>Today</small>
                  <strong>{formatMinutes(today.minutes)}</strong>
                </div>
                <Week log={focus.log} />
                <div className="focus-stats-right">
                  <small>Sessions</small>
                  <strong>{today.sessions}</strong>
                </div>
              </footer>

              <button type="button" className="focus-end" onClick={focus.stop}>
                End session
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="focus-line" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          {top}
          <button type="button" className="focus-b" onClick={focus.toggle} aria-label={playLabel}>
            <span className="eyebrow">{isBreak ? "ON A BREAK" : session.subject ? "STUDYING" : "FOCUSING"}</span>
            {session.subject && !isBreak ? <span className="focus-b-subject">{session.subject}</span> : null}
            <strong className="focus-b-time">{time}</strong>
            <span className="focus-b-hint">{session.paused ? "Paused — tap to carry on" : "Tap anywhere to pause"}</span>
          </button>
          <footer className="focus-b-foot">
            <span>
              {isBreak ? `Break · ${session.breakMinutes} min` : `Session ${sessionNo}`} · {formatMinutes(today.minutes)} today
            </span>
            <button type="button" className="focus-end" onClick={focus.stop}>
              End
            </button>
          </footer>
        </>
      )}
    </div>,
    document.body
  );
}

export default FocusScreen;
