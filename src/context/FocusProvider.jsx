import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FocusContext } from "./focusContext";
import {
  DEFAULT_MINUTES,
  KEEP_GOING_MINUTES,
  STARTER_MINUTES,
  addToLog,
  breakMinutesFor,
  cleanMinutes,
  isLongBreak,
  formatClock,
  pruneLog,
  remainingOf,
} from "../utils/focusTimer";
import { SOUNDS, playAmbient, scheduleChime, stopAmbient, unlockAudio } from "../utils/ambient";
import { toDateKey } from "../utils/dateKeys";
import { cleanGoal, crossesGoal, goalLabel } from "../utils/focusGoal";
import { useAuth } from "../hooks/useAuth";
import { importLocalDays, loadFocusDays, publishPresence, recordFocus } from "../services/focusSync";
import { clearWeek, publishWeek } from "../services/leaderboard";
import { weekKeyOf, weekMinutes } from "../utils/leaderboard";

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
  share: "u_do_focus_share",
  goal: "u_do_focus_goal",
};

/** How far back the account's focus days are loaded. */
const HISTORY_DAYS = 90;

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

/**
 * The timer takes the whole screen — status bar and browser bars too, where
 * the browser allows it. Only works from a tap, so it's called from one.
 */
const goFullscreen = () => {
  try {
    if (document.fullscreenElement || !document.fullscreenEnabled) return;
    document.documentElement.requestFullscreen?.({ navigationUI: "hide" })?.catch?.(() => {});
  } catch {
    /* Not allowed here (iPhone Safari); the timer still covers the page. */
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

/**
 * "Just start": five minutes, because five minutes is easy to say yes to.
 * When it ends there's no break — the offer is to keep going for the rest of
 * a normal round, and it waits, paused, until the person says yes.
 */
const afterStarter = (session) => ({
  phase: "focus",
  minutes: KEEP_GOING_MINUTES,
  subject: session.subject,
  count: 0,
  paused: true,
  remainingMs: KEEP_GOING_MINUTES * 60_000,
  afterStarter: true,
  ...(session.taskId ? { taskId: session.taskId } : {}),
});

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
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [initial] = useState(restore);
  const [session, setSession] = useState(initial.session);
  const [view, setView] = useState("mini");
  const [style, setStyleState] = useState(() => (read(KEYS.style, 1) === 2 ? 2 : 1));
  // Signed out, focus time lives on this device. Signed in, it lives on the
  // account (cloudLog) and follows the person across devices.
  const [guestLog, setGuestLog] = useState(initial.log);
  const [cloud, setCloud] = useState({ uid: null, log: {} });
  const [shareFocus, setShareFocusState] = useState(() => read(KEYS.share, true) !== false);
  const [setup, setSetupState] = useState(() => {
    const saved = { minutes: DEFAULT_MINUTES, subject: "", ...read(KEYS.setup, {}) };
    return { ...saved, minutes: cleanMinutes(saved.minutes) || DEFAULT_MINUTES };
  });
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSoundState] = useState(() => {
    const saved = { kind: "off", volume: 0.5, ...read(KEYS.sound, {}) };
    // White noise was retired for being too harsh; Deep is the closest calm one.
    if (saved.kind === "white") saved.kind = "brown";
    if (!SOUNDS.some(([id]) => id === saved.kind)) saved.kind = "off";
    return saved;
  });
  const [goal, setGoalState] = useState(() => cleanGoal(read(KEYS.goal, undefined)));
  const titleRef = useRef(null);

  useEffect(() => write(KEYS.session, session), [session]);
  useEffect(() => write(KEYS.style, style), [style]);
  useEffect(() => write(KEYS.log, guestLog), [guestLog]);
  useEffect(() => write(KEYS.share, shareFocus), [shareFocus]);
  useEffect(() => write(KEYS.goal, goal), [goal]);

  // Sign-in: move any device-only focus time into the account once, then
  // load the account's recent days.
  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    (async () => {
      const local = read(KEYS.log, {});
      if (Object.keys(local).length) {
        try {
          await importLocalDays(uid, local);
          write(KEYS.log, {});
          if (!cancelled) setGuestLog({});
        } catch {
          /* Kept on the device; tried again next time. */
        }
      }
      try {
        const since = toDateKey(new Date(Date.now() - HISTORY_DAYS * 86_400_000));
        const days = await loadFocusDays(uid, since);
        if (!cancelled) setCloud({ uid, log: days });
      } catch {
        if (!cancelled) setCloud({ uid, log: {} });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const log = useMemo(() => (uid ? (cloud.uid === uid ? cloud.log : {}) : guestLog), [uid, cloud, guestLog]);
  // This week's total for the friends leaderboard, written only when it
  // changes, and only once the account's days have loaded — never a 0 that
  // merely means "not loaded yet". Turning sharing off takes it down.
  const published = useRef(null);
  useEffect(() => {
    if (!uid || cloud.uid !== uid) return;
    if (!shareFocus) {
      if (published.current !== "off") clearWeek(uid).catch(() => {});
      published.current = "off";
      return;
    }
    const week = weekKeyOf(new Date());
    const minutes = Math.round(weekMinutes(cloud.log, new Date()));
    const key = `${uid}|${week}|${minutes}`;
    if (published.current === key) return;
    published.current = key;
    publishWeek(uid, { week, minutes }).catch(() => {});
  }, [uid, cloud, shareFocus]);

  // The goal check needs today's total before a stretch is added.
  const logRef = useRef({});
  useEffect(() => {
    logRef.current = log;
  }, [log]);

  // "Studying now" for friends: written on each change of state (start,
  // pause, break, end), never on every tick.
  const presenceKey = session ? `${session.phase}|${session.paused ? "p" : session.endsAt}` : "none";
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (!uid) return;
    publishPresence(uid, shareFocus ? sessionRef.current : null);
  }, [uid, shareFocus, presenceKey]);
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

  // The chime: queued on the audio clock for the exact moment this phase ends,
  // so it rings on time even in a background tab. Pausing or stopping
  // withdraws it; a chime already ringing is left to finish.
  const chimeKey = session && !session.paused ? `${session.phase}|${session.endsAt}` : null;
  useEffect(() => {
    if (!chimeKey) return undefined;
    let handle = null;
    // Audio only runs once a tap has woken it, so keep trying until it has.
    const attempt = () => {
      const current = sessionRef.current;
      if (handle || !current || current.paused) return;
      handle = scheduleChime(remainingOf(current) / 1000, current.phase === "focus" ? "break" : "focus");
      if (handle) clearInterval(retry);
    };
    const retry = setInterval(attempt, 2000);
    attempt();
    return () => {
      clearInterval(retry);
      handle?.cancel();
    };
  }, [chimeKey]);

  const goalRef = useRef(goal);
  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);

  const record = useCallback(
    (minutes, subject) => {
      if (!(minutes >= 1)) return;
      const now = new Date();
      const before = logRef.current[toDateKey(now)]?.minutes || 0;
      if (crossesGoal(before, minutes, goalRef.current)) {
        buzz([80, 60, 80, 60, 120]);
        notify("Daily goal reached", `${goalLabel(goalRef.current)} of focus today. Well done.`);
      }
      if (uid) {
        setCloud((current) => ({ uid, log: addToLog(current.uid === uid ? current.log : {}, minutes, now, subject) }));
        recordFocus(uid, { dateKey: toDateKey(now), minutes, subject });
      } else {
        setGuestLog((current) => pruneLog(addToLog(current, minutes, now, subject)));
      }
    },
    [uid]
  );

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
      if (session.phase === "focus" && session.starter) {
        record(session.minutes, session.subject);
        buzz([60, 80, 60]);
        notify("Five minutes done", "You started — that's the hard part. Keep going?");
        setSession(afterStarter(session));
      } else if (session.phase === "focus") {
        record(session.minutes, session.subject);
        buzz([60, 80, 60]);
        const completed = (session.count || 0) + 1;
        const rest = breakMinutesFor(session.minutes, completed);
        notify(
          isLongBreak(completed) ? "Four in a row" : "Focus done",
          isLongBreak(completed) ? `Great run — take a long ${rest}-minute break.` : `Nice — take ${rest} minutes.`
        );
        setSession({ ...session, phase: "break", count: completed, endsAt: Date.now() + rest * 60_000, breakMinutes: rest, longBreak: isLongBreak(completed), paused: false });
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

  /**
   * `starter` runs the five-minute "Just start" round, which leaves the saved
   * length alone. `taskId` ties the session to a task, so ADHD mode can ask
   * at the end whether it got done.
   */
  const start = useCallback((minutes = setup.minutes, subject = setup.subject, { starter = false, taskId = "" } = {}) => {
    unlockAudio();
    const clean = String(subject || "").trim().slice(0, 80);
    const length = starter ? STARTER_MINUTES : minutes;
    if (!starter) setSetupState({ minutes, subject: clean });
    setSession({
      phase: "focus",
      minutes: length,
      subject: clean,
      count: 0,
      endsAt: Date.now() + length * 60_000,
      paused: false,
      ...(starter ? { starter: true } : {}),
      ...(taskId ? { taskId } : {}),
    });
    setNow(Date.now());
    setView("full");
    goFullscreen();
  }, [setup]);

  const pause = useCallback(() => {
    setSession((current) => (current && !current.paused ? { ...current, paused: true, remainingMs: remainingOf(current) } : current));
  }, []);

  const resume = useCallback(() => {
    unlockAudio();
    setSession((current) =>
      current?.paused ? { ...current, paused: false, afterStarter: undefined, endsAt: Date.now() + current.remainingMs } : current
    );
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
    if (session.phase === "focus" && session.starter) {
      record(elapsedMinutes(session, Date.now()), session.subject);
      setSession(afterStarter(session));
    } else if (session.phase === "focus") {
      record(elapsedMinutes(session, Date.now()), session.subject);
      const completed = (session.count || 0) + 1;
      const rest = breakMinutesFor(session.minutes, completed);
      setSession({ ...session, phase: "break", count: completed, endsAt: Date.now() + rest * 60_000, breakMinutes: rest, longBreak: isLongBreak(completed), paused: false });
    } else {
      setSession({ ...session, phase: "focus", paused: true, remainingMs: session.minutes * 60_000 });
    }
    setNow(Date.now());
  }, [session, record]);

  /** Finishes the whole thing, logging any focus minutes spent. */
  const stop = useCallback(() => {
    if (session) record(elapsedMinutes(session, Date.now()), session.subject);
    setSession(null);
    setView("mini");
  }, [session, record]);

  /**
   * Puts the timer on a study room's clock: the host's end time, or paused
   * where the host paused. Someone joining partway counts only what is left.
   */
  const follow = useCallback(({ room, minutes, endsAt, paused = false, remainingMs = 0 }) => {
    setSession((current) => {
      const same = current?.room === room;
      const left = paused ? remainingMs : endsAt - Date.now();
      if (left <= 0) return current;
      if (same && current.phase === "focus" && Boolean(current.paused) === paused && (paused ? current.remainingMs === remainingMs : current.endsAt === endsAt)) {
        return current;
      }
      // Pausing or resuming the same round keeps its length; anything else
      // is a new round, counted from now.
      const midRound = same && current.phase === "focus" && (paused || (current.paused && current.remainingMs < current.minutes * 60_000));
      const counted = midRound ? current.minutes : Math.min(minutes, Math.max(1, Math.ceil(left / 60_000)));
      return {
        phase: "focus",
        minutes: counted,
        subject: same ? current.subject : setup.subject,
        count: same ? current.count || 0 : 0,
        endsAt: paused ? null : endsAt,
        remainingMs: paused ? remainingMs : undefined,
        paused,
        room,
      };
    });
    setNow(Date.now());
  }, [setup.subject]);

  /** Leaves a room's clock; the timer keeps going on its own. */
  const unfollow = useCallback((room) => {
    setSession((current) => (current?.room === room ? { ...current, room: undefined } : current));
  }, []);

  const open = useCallback(() => {
    setView("full");
    goFullscreen();
  }, []);

  /** Called from a tap, so it can also wake the audio context on iOS. */
  const setSound = useCallback((patch) => {
    unlockAudio();
    setSoundState((current) => ({ ...current, ...patch }));
  }, []);

  const setSetup = useCallback((patch) => setSetupState((current) => ({ ...current, ...patch })), []);
  const setStyle = useCallback((next) => setStyleState(next === 2 ? 2 : 1), []);
  const setGoal = useCallback((next) => setGoalState(cleanGoal(next)), []);
  const toggleStyle = useCallback(() => setStyleState((current) => (current === 1 ? 2 : 1)), []);

  const value = useMemo(
    () => ({
      session,
      now,
      remaining: remainingOf(session, now),
      view,
      open,
      minimize: () => setView("mini"),
      style,
      setStyle,
      toggleStyle,
      log,
      shareFocus,
      setShareFocus: setShareFocusState,
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
      follow,
      unfollow,
      goal,
      setGoal,
    }),
    [session, now, view, style, setStyle, toggleStyle, log, shareFocus, sound, setSound, setup, setSetup, start, pause, resume, toggle, reset, skip, stop, follow, unfollow, open, goal, setGoal]
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}
