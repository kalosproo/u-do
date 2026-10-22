import { toDateKey } from "./dateKeys.js";

/**
 * The focus timer's arithmetic, kept free of React so it can be tested.
 * Time is measured against an end timestamp, never by counting ticks, so a
 * backgrounded tab or a sleeping phone still shows the right time.
 */

export const PRESETS = [25, 50, 90];
export const DEFAULT_MINUTES = 25;

/** A rest that scales with the stretch it follows. */
/**
 * Break length after a session. Every fourth session in a row earns a long
 * break — the classic Pomodoro rhythm — sized to the session length.
 * `completed` is how many sessions are done, counting the one just finished.
 */
export const LONG_BREAK_EVERY = 4;

export const isLongBreak = (completed) => completed > 0 && completed % LONG_BREAK_EVERY === 0;

export const breakMinutesFor = (focusMinutes, completed = 0) => {
  if (isLongBreak(completed)) return focusMinutes >= 50 ? 30 : 20;
  return focusMinutes >= 90 ? 15 : focusMinutes >= 50 ? 10 : 5;
};

/** 1499000 → "24:59"; an hour or more → "1:29:59". Rounds up, so 0.4s left still reads 0:01. */
export const formatClock = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** "1h 40m", "25m", "0m". */
export const formatMinutes = (minutes) => {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
};

/** Milliseconds left in a session, whether running (endsAt) or paused (remainingMs). */
export const remainingOf = (session, now = Date.now()) => {
  if (!session) return 0;
  if (session.paused) return Math.max(0, session.remainingMs);
  return Math.max(0, session.endsAt - now);
};

/** How far through, 0 to 1. */
export const progressOf = (session, now = Date.now()) => {
  if (!session) return 0;
  const total = session.minutes * 60_000;
  return total ? Math.min(1, Math.max(0, 1 - remainingOf(session, now) / total)) : 0;
};

/** Adds a finished focus stretch to the per-day log. Returns a new object. */
export const addToLog = (log, minutes, date = new Date(), subject = "") => {
  const key = toDateKey(date);
  const day = log?.[key] || { minutes: 0, sessions: 0 };
  const next = { ...day, minutes: day.minutes + minutes, sessions: day.sessions + 1 };
  const name = String(subject || "").trim().slice(0, 40);
  if (name) next.subjects = { ...(day.subjects || {}), [name]: (day.subjects?.[name] || 0) + minutes };
  return { ...(log || {}), [key]: next };
};

/** The last `days` days, oldest first, each with its minutes — for the bar strip. */
export const lastDays = (log, days = 7, today = new Date()) =>
  Array.from({ length: days }, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i));
    const key = toDateKey(date);
    return { key, minutes: log?.[key]?.minutes || 0 };
  });

/** Keeps the log to the last 60 days so it can't grow forever in storage. */
export const pruneLog = (log, today = new Date(), keepDays = 60) => {
  const cutoff = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - keepDays));
  return Object.fromEntries(Object.entries(log || {}).filter(([key]) => key >= cutoff));
};
