import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdhdContext } from "./adhdContext";
import { useAuth } from "../hooks/useAuth";
import { hasBeta, loadAdhdPrefs, saveAdhdPrefs } from "../services/adhd";
import { cleanPicks, keepLocalPrefs, pickLimitOf, picksFor, planDay, textSizeOf, todayPartsOf } from "../utils/adhd";

/**
 * ADHD mode: a calmer, one-thing-at-a-time version of the app, for the
 * accounts the rules let try it. Everyone else never sees a trace of it.
 *
 * Whether it's on, and today's picks, live on the account so they
 * follow the person between devices. A copy on this device means the right
 * home screen shows at once rather than flashing the other one first.
 */

const CACHE_KEY = "u_do_adhd";
// Feels for this device, so they live here, not on the account: lively or
// calm motion, how many things a day, the text size, and what Today shows.
const MOTION_KEY = "u_do_motion";
const PICKS_KEY = "u_do_picks";
const TEXT_KEY = "u_do_text";
const TODAY_KEY = "u_do_today";

const readSetting = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeSetting = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* A convenience only. */
  }
};

const readMotion = () => (readSetting(MOTION_KEY) === "calm" ? "calm" : "lively");

const readTodayParts = () => {
  try {
    return todayPartsOf(JSON.parse(readSetting(TODAY_KEY) || "null"));
  } catch {
    return todayPartsOf(null);
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

  // A change stays marked unsynced until the server has it, so one made with
  // no signal is still this device's to send next time, not lost to the older copy.
  const save = useCallback((next) => {
    saveAdhdPrefs(next.uid, next)
      .then(() =>
        setState((now) => (now.uid === next.uid && now.editedAt === next.editedAt ? { ...now, unsynced: false } : now))
      )
      .catch(() => {});
  }, []);

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
      // Picked last time with no signal, and the app closed before the save
      // got out? Then the server's copy is the older one: keep this device's
      // and send it again, unless another device has saved since.
      if (available && keepLocalPrefs(cached, prefs)) {
        const kept = { ...cached, uid, available };
        setState(kept);
        save(kept);
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
  }, [uid, save]);

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
    writeSetting(MOTION_KEY, value);
  }, []);

  const [pickLimit, setPickLimitState] = useState(() => pickLimitOf(readSetting(PICKS_KEY)));
  const setPickLimit = useCallback((next) => {
    const value = pickLimitOf(next);
    setPickLimitState(value);
    writeSetting(PICKS_KEY, String(value));
  }, []);

  // Keyed off the root element like the motion, and only while ADHD mode is on.
  const [textSize, setTextSizeState] = useState(() => textSizeOf(readSetting(TEXT_KEY)));
  useEffect(() => {
    if (on && textSize !== "standard") document.documentElement.dataset.text = textSize;
    else delete document.documentElement.dataset.text;
  }, [on, textSize]);
  const setTextSize = useCallback((next) => {
    const value = textSizeOf(next);
    setTextSizeState(value);
    writeSetting(TEXT_KEY, value);
  }, []);

  const [todayParts, setTodayParts] = useState(readTodayParts);
  const setTodayPart = useCallback((part, shown) => setTodayParts((now) => ({ ...now, [part]: Boolean(shown) })), []);
  useEffect(() => writeSetting(TODAY_KEY, JSON.stringify(todayParts)), [todayParts]);

  const update = useCallback(
    (patch) => {
      if (!uid) return;
      edits.current += 1;
      // Never the same stamp twice, even for two changes in one millisecond.
      const editedAt = Math.max(Date.now(), (Number(current.editedAt) || 0) + 1);
      const next = { ...current, ...patch, uid, editedAt, unsynced: true };
      setState(next);
      save(next);
    },
    [uid, current, save]
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
      pickLimit,
      setPickLimit,
      textSize,
      setTextSize,
      todayParts,
      setTodayPart,
    }),
    [uid, current.available, on, setEnabled, picks, setPicks, motion, setMotion, pickLimit, setPickLimit, textSize, setTextSize, todayParts, setTodayPart]
  );

  return <AdhdContext.Provider value={value}>{children}</AdhdContext.Provider>;
}
