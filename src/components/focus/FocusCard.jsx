import { FiMaximize2, FiPause, FiPlay, FiSquare } from "react-icons/fi";
import { Link, useLocation } from "react-router-dom";

import { useFocus } from "../../hooks/useFocus";
import { PRESETS, formatClock, formatMinutes, lastDays, progressOf } from "../../utils/focusTimer";
import { toDateKey } from "../../utils/dateKeys";
import { goalLabel, goalProgress } from "../../utils/focusGoal";

function MiniRing({ progress, paused }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className={`focus-mini-ring ${paused ? "is-paused" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="focus-ring-track" />
        <circle cx="50" cy="50" r={r} className="focus-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
      </svg>
      <span>{paused ? <FiPause /> : <span className="focus-mini-dot" />}</span>
    </div>
  );
}

/** Today's minutes against the daily goal, as a small ring. */
function GoalRing({ minutes, goal }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const progress = goalProgress(minutes, goal);
  return (
    <svg className={`focus-goal-ring ${progress >= 1 ? "is-done" : ""}`} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r={r} className="focus-ring-track" />
      <circle cx="24" cy="24" r={r} className="focus-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
    </svg>
  );
}

function WeekStrip({ log }) {
  const days = lastDays(log, 7);
  const top = Math.max(25, ...days.map((day) => day.minutes));
  return (
    <div className="focus-card-week" aria-hidden="true">
      {days.map((day, i) => (
        <span key={day.key} className={i === days.length - 1 ? "is-today" : ""}>
          <i style={{ height: `${Math.max(8, (day.minutes / top) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

/**
 * Focus, on Home: pick a length, say what it's for if you like, start.
 * Opt-in — its own study mode, not attached to every task. While a session
 * runs the card becomes a live timer with a progress ring, and opens the
 * full screen.
 */
function FocusCard() {
  const focus = useFocus();
  const { pathname } = useLocation();
  if (!focus) return null;

  const { session, setup } = focus;
  const today = focus.log[toDateKey(new Date())] || { minutes: 0, sessions: 0 };

  if (session) {
    const isBreak = session.phase === "break";
    const total = isBreak ? session.breakMinutes : session.minutes;
    const progress = progressOf({ ...session, minutes: total }, focus.now);
    const sessionNo = (session.count || 0) + (isBreak ? 0 : 1);

    return (
      <section className="panel focus-card is-running" aria-label="Focus timer">
        <div className="focus-card-live">
          <MiniRing progress={progress} paused={session.paused} />
          <div className="focus-card-live-text">
            <p className="eyebrow">
              {isBreak ? "BREAK" : session.paused ? "PAUSED" : "FOCUSING"} · SESSION {sessionNo}
            </p>
            <strong className="focus-card-time">{formatClock(focus.remaining)}</strong>
            <span className="focus-card-sub">
              {isBreak ? `${total} min break` : session.subject || `${total} min focus`}
            </span>
          </div>
        </div>

        <div className="focus-card-bar" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="focus-card-controls">
          <button type="button" className="btn btn-primary focus-card-open" onClick={focus.open}>
            <FiMaximize2 /> Full screen
          </button>
          <button
            type="button"
            className="focus-card-icon"
            onClick={focus.toggle}
            aria-label={session.paused ? "Resume" : "Pause"}
            title={session.paused ? "Resume" : "Pause"}
          >
            {session.paused ? <FiPlay /> : <FiPause />}
          </button>
          <button type="button" className="focus-card-icon" onClick={focus.stop} aria-label="End session" title="End session">
            <FiSquare />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel focus-card" aria-label="Focus timer">
      <div className="focus-card-head">
        <div>
          <p className="eyebrow">FOCUS</p>
          <h3 className="focus-card-title">Study without distractions.</h3>
        </div>
        <div className="focus-card-today-wrap">
          {focus.goal ? <GoalRing minutes={today.minutes} goal={focus.goal} /> : null}
          <div className="focus-card-today">
            <strong>{formatMinutes(today.minutes)}</strong>
            {pathname === "/focus" ? (
              <span>{focus.goal ? `of ${goalLabel(focus.goal)} today` : "today"}</span>
            ) : (
              <Link to="/focus" className="focus-card-stats">
                {focus.goal ? `of ${goalLabel(focus.goal)} · stats` : "today · stats"}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="focus-card-setup">
        <strong className="focus-card-time">{formatClock(setup.minutes * 60_000)}</strong>
        <WeekStrip log={focus.log} />
      </div>

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
    </section>
  );
}

export default FocusCard;
