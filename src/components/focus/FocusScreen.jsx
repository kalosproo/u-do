import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiBell, FiBookOpen, FiChevronDown, FiMaximize, FiMinimize, FiPause, FiPlay, FiSquare, FiUsers } from "react-icons/fi";

import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { useStudyRoom } from "../../hooks/useStudyRoom";
import { formatClock, formatMinutes, lastDays, progressOf } from "../../utils/focusTimer";
import { toDateKey } from "../../utils/dateKeys";
import FlipCard from "./FlipCard";
import SoundPicker from "./SoundPicker";
import RoomReactions from "./RoomReactions";

const STYLES = [
  [1, "Timer"],
  [2, "Flip clock"],
];

/** In the flip style the controls fade after this long without a touch. */
const CALM_AFTER_MS = 3500;

const canFullscreen = () => typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

function Ring({ progress }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  return (
    <svg className="focus-ring-svg" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="focus-ring-track" />
      <circle cx="50" cy="50" r={r} className="focus-ring-fill" strokeDasharray={c} strokeDashoffset={c * progress} />
    </svg>
  );
}

function Week({ log }) {
  const days = lastDays(log, 7);
  const top = Math.max(25, ...days.map((d) => d.minutes));
  return (
    <div className="focus-week" aria-hidden="true">
      {days.map((day, i) => (
        <span key={day.key} className={i === days.length - 1 ? "is-today" : ""}>
          <i style={{ height: `${Math.max(8, (day.minutes / top) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

const pad = (n) => String(n).padStart(2, "0");

/** The two cards: minutes (up to 99) and seconds. */
const flipCards = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return [pad(Math.floor(total / 60)), pad(total % 60)];
};

const endsAt = (ms) =>
  new Date(Date.now() + ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * The full-screen timer, in two styles switched like the theme:
 *
 *  1 — Timer: the iPhone Clock timer's shape. A thin ring that empties, the
 *      time in thin digits, when it ends, and round Cancel and Pause.
 *  2 — Flip clock: split-flap cards that flip as the seconds change. In
 *      landscape it fills the screen like StandBy, and the controls fade
 *      away until the screen is touched.
 *
 * Both are laid out for portrait and landscape at every phone size.
 */
function FocusScreen() {
  const focus = useFocus();
  const study = useStudyRoom();
  const { user } = useAuth();
  const { session, view, style } = focus || {};
  const visible = Boolean(focus && view === "full" && session);
  const [calm, setCalm] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const calmTimer = useRef(null);

  const wake = useCallback(() => {
    setCalm(false);
    clearTimeout(calmTimer.current);
    calmTimer.current = setTimeout(() => setCalm(true), CALM_AFTER_MS);
  }, []);

  const leaveFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };

  const minimize = () => {
    leaveFullscreen();
    focus.minimize();
  };

  const cancel = () => {
    leaveFullscreen();
    focus.stop();
  };

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea, select")) return;
      if (event.key === "Escape" && !document.fullscreenElement) focus.minimize();
      if (event.key === " ") {
        event.preventDefault();
        focus.toggle();
      }
    };
    const onFull = () => setIsFull(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFull);
    document.body.classList.add("is-focusing");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFull);
      document.body.classList.remove("is-focusing");
    };
  }, [visible, focus]);

  // The calm timer starts whenever the screen opens; any touch restarts it.
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(wake, 0);
    return () => {
      clearTimeout(timer);
      clearTimeout(calmTimer.current);
    };
  }, [visible, wake]);

  if (!visible) return null;

  const isBreak = session.phase === "break";
  const totalMinutes = isBreak ? session.breakMinutes : session.minutes;
  const remaining = focus.remaining;
  const progress = progressOf({ ...session, minutes: totalMinutes }, focus.now);
  const today = focus.log[toDateKey(new Date())] || { minutes: 0, sessions: 0 };
  const sessionNo = (session.count || 0) + (isBreak ? 0 : 1);
  const label = isBreak ? (session.longBreak ? "Long break" : "Break") : session.subject || "Focus";
  const ends = session.paused ? "Paused" : endsAt(remaining);
  // Only the flip clock goes quiet, and only while it is actually running.
  const quiet = style === 2 && calm && !session.paused;

  // In a study room the host's pause pauses everyone.
  const inRoom = Boolean(session.room && study?.room?.id === session.room);
  const toggle = inRoom && study.isHost && session.phase === "focus" ? study.toggle : focus.toggle;
  const roomNames = inRoom ? study.members.filter((member) => member.uid !== user?.uid).map((member) => member.name.split(" ")[0]) : [];
  const roomLine = roomNames.length
    ? `With ${roomNames.slice(0, 3).join(", ")}${roomNames.length > 3 ? ` +${roomNames.length - 3}` : ""}`
    : "Waiting for friends to join";

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
  };

  const controls = (
    <div className="focus-buttons">
      <button type="button" className="focus-btn focus-btn-cancel" onClick={cancel}>
        Cancel
      </button>
      <button type="button" className="focus-btn focus-btn-main" onClick={toggle}>
        {session.paused ? "Resume" : "Pause"}
      </button>
    </div>
  );

  const cards = flipCards(remaining);

  return createPortal(
    <div
      className={`focus-screen focus-style-${style} ${isBreak ? "is-break" : ""} ${quiet ? "is-quiet" : ""} ${inRoom ? "in-room" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Focus timer"
      onPointerDown={wake}
    >
      <header className="focus-top">
        <div className="focus-top-left">
          <button type="button" className="focus-icon-btn" onClick={minimize} aria-label="Minimise timer" title="Minimise">
            <FiChevronDown />
          </button>
          {style === 2 ? (
            <button type="button" className="focus-icon-btn" onClick={cancel} aria-label="End session" title="End session">
              <FiSquare />
            </button>
          ) : null}
        </div>
        <span className="eyebrow focus-top-label">
          {isBreak ? (session.longBreak ? "LONG BREAK" : "BREAK") : `SESSION ${((sessionNo - 1) % 4) + 1} OF 4`}
        </span>
        <div className="focus-top-right">
          {style === 2 ? (
            <button
              type="button"
              className="focus-pause-btn"
              onClick={toggle}
              aria-label={session.paused ? "Resume" : "Pause"}
              title={session.paused ? "Resume" : "Pause"}
            >
              {session.paused ? <FiPlay /> : <FiPause />}
            </button>
          ) : null}
          {inRoom ? <RoomReactions compact /> : null}
          <SoundPicker />
          {canFullscreen() ? (
            <button type="button" className="focus-icon-btn focus-fullscreen-btn" onClick={toggleFullscreen} aria-label={isFull ? "Exit full screen" : "Full screen"} title={isFull ? "Exit full screen" : "Full screen"}>
              {isFull ? <FiMinimize /> : <FiMaximize />}
            </button>
          ) : null}
          <div className="focus-style" role="group" aria-label="Timer style">
            {STYLES.map(([value, name]) => (
              <button
                key={value}
                type="button"
                className={style === value ? "is-active" : ""}
                aria-pressed={style === value}
                aria-label={name}
                title={name}
                onClick={() => focus.setStyle(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </header>

      {style === 1 ? (
        <div className="focus-a">
          <div className="focus-ring">
            <Ring progress={progress} />
            <div className="focus-ring-label">
              {session.subject && !isBreak ? (
                <span className="focus-ring-subject">
                  <FiBookOpen aria-hidden="true" /> {session.subject}
                </span>
              ) : (
                <span className="focus-ring-subject">{isBreak ? (session.longBreak ? "Long break" : "Break") : "Focus"}</span>
              )}
              <strong className="focus-time">{formatClock(remaining)}</strong>
              <span className="focus-ends">
                <FiBell aria-hidden="true" /> {ends}
              </span>
            </div>
          </div>

          <div className="focus-a-side">
            {controls}
            <button type="button" className="focus-link" onClick={focus.skip}>
              {isBreak ? "Skip break" : "Finish early and take a break"}
            </button>
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
          </div>
        </div>
      ) : (
        <div className="focus-b">
          <p className="focus-b-line">
            {label}
            {session.paused ? " · Paused" : ""}
            {inRoom ? ` · ${roomLine.charAt(0).toLowerCase()}${roomLine.slice(1)}` : ""}
          </p>
          <div
            className="focus-flip"
            role="timer"
            aria-label={`${formatClock(remaining)} left`}
          >
            {cards.map((value, i) => (
              <FlipCard key={i} value={value} />
            ))}
          </div>
          <p className="focus-b-line focus-b-caps">
            {session.paused ? "Paused" : `Ends ${ends}`}
          </p>
        </div>
      )}

      {inRoom && style === 1 ? (
        <p className="focus-room">
          <FiUsers aria-hidden="true" />
          {roomLine}
        </p>
      ) : null}
    </div>,
    document.body
  );
}

export default FocusScreen;
