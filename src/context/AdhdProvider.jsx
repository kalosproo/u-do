import { useCallback, useEffect, useMemo, useState } from "react";

import { AdhdContext } from "./adhdContext";
import { useAuth } from "../hooks/useAuth";
import { hasBeta, loadAdhdPrefs, saveAdhdPrefs } from "../services/adhd";
import { cleanPicks, picksFor } from "../utils/adhd";
import { todayKey } from "../utils/dateKeys";

/**
 * ADHD mode: a calmer, one-thing-at-a-time version of the app, for the
 * accounts the rules let try it. Everyone else never sees a trace of it.
 *
 * Whether it's on, and today's three picks, live on the account so they
 * follow the person between devices. A copy on this device means the right
 * home screen shows at once rather than flashing the other one first.
 */

const CACHE_KEY = "u_do_adhd";
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

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
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

  const update = useCallback(
    (patch) => {
      if (!uid) return;
      const next = { ...current, ...patch, uid };
      setState(next);
      // Kept here if the save fails; the next change tries again.
      saveAdhdPrefs(uid, next).catch(() => {});
    },
    [uid, current]
  );

  const setEnabled = useCallback((enabled) => update({ enabled: Boolean(enabled) }), [update]);
  const setPicks = useCallback((picks) => update({ day: todayKey(), picks: cleanPicks(picks) }), [update]);

  const today = todayKey();
  const picks = useMemo(() => picksFor(current, today), [current, today]);

  const value = useMemo(
    () => ({
      available: Boolean(uid && current.available),
      enabled: on,
      setEnabled,
      picks,
      setPicks,
    }),
    [uid, current.available, on, setEnabled, picks, setPicks]
  );

  return <AdhdContext.Provider value={value}>{children}</AdhdContext.Provider>;
}
