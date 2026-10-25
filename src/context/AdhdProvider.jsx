import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdhdContext } from "./adhdContext";
import { useAuth } from "../hooks/useAuth";
import { hasBeta, loadAdhdPrefs, saveAdhdPrefs } from "../services/adhd";
import { cleanPicks, picksFor, planDay } from "../utils/adhd";

/**
 * ADHD mode: a calmer, one-thing-at-a-time version of the app, for the
 * accounts the rules let try it. Everyone else never sees a trace of it.
 *
 * Whether it's on, and today's three picks, live on the account so they
 * follow the person between devices. A copy on this device means the right
 * home screen shows at once rather than flashing the other one first.
 */

const CACHE_KEY = "u_do_adhd";
// Lively or calm motion: a feel for this device, so it lives here, not on the account.
const MOTION_KEY = "u_do_motion";

const readMotion = () => {
  try {
    return localStorage.getItem(MOTION_KEY) === "calm" ? "calm" : "lively";
  } catch {
    return "lively";
  }
};
const OFF = { uid: null, available: false, enabled: false, day: "", picks: [] };

const readCache = (uid) => {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return saved && uid && saved.uid === uid ? { ...OFF, ...saved } : { ...OFF, uid };
  } catch {
    return { ...OFF, uid };
  }
};

const writeCache = (state) => {
  try {
    if (state.uid) localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    /* A convenience only. */
  }
};

export function AdhdProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [state, setState] = useState(() => readCache(uid));
  // Another account's state never shows, even for the moment before it reloads.
  const current = useMemo(() => (state.uid === uid ? state : uid ? readCache(uid) : OFF), [state, uid]);
  // Counts changes made on this device, so a load that started before one of
  // them can tell that what it brings back is already out of date.
  const edits = useRef(0);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    const editsAtStart = edits.current;
    (async () => {
      const cached = readCache(uid);
      const available = await hasBeta("adhd", cached.available);
      let prefs = null;
      if (available) {
        try {
          prefs = await loadAdhdPrefs(uid);
        } catch {
          prefs = cached;
        }
      }
      if (cancelled) return;
      // Picked something while that was loading (easy on a slow phone)? Then
      // this device has the newer picks and has already saved them: keep them,
      // and only learn whether the account may use ADHD mode at all. Without
      // this, the older copy landed late and the picker came back.
      if (edits.current !== editsAtStart) {
        setState((now) => {
          const base = now.uid === uid ? now : readCache(uid);
          return { ...base, uid, available, enabled: available && base.enabled };
        });
        return;
      }
      setState({
        uid,
        available,
        enabled: available && prefs?.enabled === true,
        day: prefs?.day || "",
        picks: cleanPicks(prefs?.picks),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => writeCache(current), [current]);

  // The calm look is keyed off the root element, like the theme.
  const on = Boolean(uid && current.available && current.enabled);
  useEffect(() => {
    if (on) document.documentElement.dataset.adhd = "on";
    else delete document.documentElement.dataset.adhd;
  }, [on]);

  const [motion, setMotionState] = useState(readMotion);
  // Only ADHD mode reads it, so nobody else's page carries it.
  useEffect(() => {
    if (on) document.documentElement.dataset.motion = motion;
    else delete document.documentElement.dataset.motion;
  }, [on, motion]);
  const setMotion = useCallback((next) => {
    const value = next === "calm" ? "calm" : "lively";
    setMotionState(value);
    try {
      localStorage.setItem(MOTION_KEY, value);
    } catch {
      /* A convenience only. */
    }
  }, []);

  const update = useCallback(
    (patch) => {
      if (!uid) return;
      edits.current += 1;
      const next = { ...current, ...patch, uid };
      setState(next);
      // Kept here if the save fails; the next change tries again.
      saveAdhdPrefs(uid, next).catch(() => {});
    },
    [uid, current]
  );

  const setEnabled = useCallback((enabled) => update({ enabled: Boolean(enabled) }), [update]);
  const setPicks = useCallback((picks) => update({ day: planDay(), picks: cleanPicks(picks) }), [update]);

  const day = planDay();
  const picks = useMemo(() => picksFor(current, day), [current, day]);

  const value = useMemo(
    () => ({
      available: Boolean(uid && current.available),
      enabled: on,
      setEnabled,
      picks,
      setPicks,
      motion,
      setMotion,
    }),
    [uid, current.available, on, setEnabled, picks, setPicks, motion, setMotion]
  );

  return <AdhdContext.Provider value={value}>{children}</AdhdContext.Provider>;
}
