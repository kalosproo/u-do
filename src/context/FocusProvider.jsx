import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FocusContext } from "./focusContext";
import {
  DEFAULT_MINUTES,
  addToLog,
  breakMinutesFor,
  formatClock,
  pruneLog,
  remainingOf,
} from "../utils/focusTimer";
import { playAmbient, stopAmbient, unlockAudio } from "../utils/ambient";

/**
 * The focus timer, app-wide.
 *
 * One session at a time, kept in localStorage so a reload, a closed tab or a
 * phone that slept carries on where it was. Time comes from an end
 * timestamp, so a tab the browser throttled in the background is still
 * right when it wakes. Finished focus minutes go into a per-day log on this
 * device, which the Home card and the focus screen read.
 *
 * Two full-screen styles, chosen like the theme and remembered: 1 is the
 * ring, 2 is the big clock.
 */

const KEYS = {
  session: "u_do_focus_session",
  style: "u_do_focus_style",
  log: "u_do_focus_log",
  setup: "u_do_focus_setup",
  sound: "u_do_focus_sound",
};

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is a convenience here, never a requirement. */
  }
};

const buzz = (pattern) => {
  try {
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) navigator.vibrate?.(pattern);
  } catch {
    /* No motor, no matter. */
  }
};

const notify = (title, body) => {
  try {
    if (document.visibilityState === "visible") return;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png", tag: "udo-focus" });
    }
  } catch {
    /* Some mobile browsers only allow notifications from a service worker. */
  }
};

const elapsedMinutes = (session, now) =>
  session?.phase === "focus" ? Math.floor((session.minutes * 60_000 - remainingOf(session, now)) / 60_000) : 0;

/** A session that ended long ago while the app was closed is settled, not resumed. */
const STALE_AFTER_MS = 30 * 60_000;

const restore = () => {
  const session = read(KEYS.session, null);
  let log = pruneLog(read(KEYS.log, {}));
  if (session && !session.paused && Date.now() - session.endsAt > STALE_AFTER_MS) {
    if (session.phase === "focus") log = pruneLog(addToLog(log, session.minutes, new Date(session.endsAt)));
    return { session: null, log };
  }
  return { session, log };
};

export function FocusProvider({ children }) {
  const [initial] = useState(restore);
  const [session, setSession] = useState(initial.session);
  const [view, setView] = useState("mini");
  const [style, setStyleState] = useState(() => (read(KEYS.style, 1) === 2 ? 2 : 1));
  const [log, setLog] = useState(initial.log);
  const [setup, setSetupState] = useState(() => ({ minutes: DEFAULT_MINUTES, subject: "", ...read(KEYS.setup, {}) }));
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSoundState] = useState(() => ({ kind: "off", volume: 0.5, ...read(KEYS.sound, {}) }));
  const titleRef = useRef(null);

  useEffect(() => write(KEYS.session, session), [session]);
  useEffect(() => write(KEYS.style, style), [style]);
  useEffect(() => write(KEYS.log, log), [log]);
  useEffect(() => write(KEYS.setup, setup), [setup]);
  useEffect(() => write(KEYS.sound, sound), [sound]);

  // Sound plays only while focus is actually running: not on a break, not
  // paused, and never after the session ends.
  const soundOn = Boolean(session && !session.paused && session.phase === "focus" && sound.kind !== "off");
  useEffect(() => {
    if (soundOn) playAmbient(sound.kind, sound.volume);
    else stopAmbient();
  }, [soundOn, sound.kind, sound.volume]);
  useEffect(() => () => stopAmbient(), []);

  const record = useCallback((minutes) => {
    if (minutes >= 1) setLog((current) => pruneLog(addToLog(current, minutes)));
  }, []);

  // Ticks only while something is counting down.
  useEffect(() => {
    if (!session || session.paused) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [session]);

  // A phase ends: focus is logged and a break starts; a break ends and the
  // next focus waits, paused, for the person to begin it.
  useEffect(() => {
    if (!session || session.paused || remainingOf(session, now) > 0) return;

    const timer = setTimeout(() => {
      if (session.phase === "focus") {
        record(session.minutes);
        buzz([60, 80, 60]);
        notify("Focus done", `Nice — take ${breakMinutesFor(session.minutes)} minutes.`);
        const rest = breakMinutesFor(session.minutes);
        setSession({ ...session, phase: "break", count: (session.count || 0) + 1, endsAt: Date.now() + rest * 60_000, breakMinutes: rest, paused: false });
      } else {
        buzz([40, 60, 40]);
        notify("Break's over", "Ready for the next one?");
        setSession({ ...session, phase: "focus", paused: true, remainingMs: session.minutes * 60_000 });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [session, now, record]);

  // The tab title carries the time while a session runs.
  useEffect(() => {
    if (!session) {
      if (titleRef.current) document.title = titleRef.current;
      titleRef.current = null;
      return;
    }
    if (titleRef.current === null) titleRef.current = document.title;
    const label = session.phase === "break" ? "Break" : session.paused ? "Paused" : "Focus";
    document.title = `${formatClock(remainingOf(session, now))} · ${label} — U.Do`;
  }, [session, now]);

  // Keep the screen on while the full-screen timer is showing and running.
  useEffect(() => {
    if (view !== "full" || !session || session.paused || !navigator.wakeLock) return undefined;
    let lock;
    let released = false;
    navigator.wakeLock
      .request("screen")
      .then((sentinel) => {
        if (released) sentinel.release().catch(() => {});
        else lock = sentinel;
      })
      .catch(() => {});
    return () => {
      released = true;
      lock?.release().catch(() => {});
    };
  }, [view, session]);

  const start = useCallback((minutes = setup.minutes, subject = setup.subject) => {
    unlockAudio();
    const clean = String(subject || "").trim().slice(0, 80);
    setSetupState({ minutes, subject: clean });
    setSession({ phase: "focus", minutes, subject: clean, count: 0, endsAt: Date.now() + minutes * 60_000, paused: false });
    setNow(Date.now());
    setView("full");
  }, [setup]);

  const pause = useCallback(() => {
    setSession((current) => (current && !current.paused ? { ...current, paused: true, remainingMs: remainingOf(current) } : current));
  }, []);

  const resume = useCallback(() => {
    unlockAudio();
    setSession((current) => (current?.paused ? { ...current, paused: false, endsAt: Date.now() + current.remainingMs } : current));
    setNow(Date.now());
  }, []);

  const toggle = useCallback(() => (session?.paused ? resume() : pause()), [session, pause, resume]);

  /** Back to the start of the current phase, paused. */
  const reset = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      const minutes = current.phase === "break" ? current.breakMinutes : current.minutes;
      return { ...current, paused: true, remainingMs: minutes * 60_000 };
    });
  }, []);

  /** Ends this phase now. Focus time already spent still counts. */
  const skip = useCallback(() => {
    if (!session) return;
    if (session.phase === "focus") {
      record(elapsedMinutes(session, Date.now()));
      const rest = breakMinutesFor(session.minutes);
      setSession({ ...session, phase: "break", count: (session.count || 0) + 1, endsAt: Date.now() + rest * 60_000, breakMinutes: rest, paused: false });
    } else {
      setSession({ ...session, phase: "focus", paused: true, remainingMs: session.minutes * 60_000 });
    }
    setNow(Date.now());
  }, [session, record]);

  /** Finishes the whole thing, logging any focus minutes spent. */
  const stop = useCallback(() => {
    if (session) record(elapsedMinutes(session, Date.now()));
    setSession(null);
    setView("mini");
  }, [session, record]);

  /** Called from a tap, so it can also wake the audio context on iOS. */
  const setSound = useCallback((patch) => {
    unlockAudio();
    setSoundState((current) => ({ ...current, ...patch }));
  }, []);

  const setSetup = useCallback((patch) => setSetupState((current) => ({ ...current, ...patch })), []);
  const setStyle = useCallback((next) => setStyleState(next === 2 ? 2 : 1), []);
  const toggleStyle = useCallback(() => setStyleState((current) => (current === 1 ? 2 : 1)), []);

  const value = useMemo(
    () => ({
      session,
      now,
      remaining: remainingOf(session, now),
      view,
      open: () => setView("full"),
      minimize: () => setView("mini"),
      style,
      setStyle,
      toggleStyle,
      log,
      sound,
      setSound,
      setup,
      setSetup,
      start,
      pause,
      resume,
      toggle,
      reset,
      skip,
      stop,
    }),
    [session, now, view, style, setStyle, toggleStyle, log, sound, setSound, setup, setSetup, start, pause, resume, toggle, reset, skip, stop]
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}
