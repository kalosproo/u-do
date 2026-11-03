import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { loadFocusDays } from "../../services/focusSync";
import { levelFor, mergeFocusLogs, pointsFrom } from "../../utils/adhd";
import { useWarm } from "./useWarm";

/**
 * Points and level from the person's own records. The focus timer only keeps
 * recent days, so the whole focus history is read once a session (and kept
 * warm for the other screens), with today's live minutes laid over it.
 *
 * `shown` once there's something sensible to show. `ready` only once every
 * record has arrived, so nothing celebrates a level that just looked new
 * because half the history was still on its way.
 */
export function useProgress(tasks, habits) {
  const { user } = useAuth();
  const focus = useFocus();
  const uid = user?.uid || "";
  const [allFocus, setAllFocus] = useWarm(uid ? `${uid}:focusAll` : "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uid || allFocus) return undefined;
    let cancelled = false;
    loadFocusDays(uid, "0000-01-01")
      .then((days) => {
        if (!cancelled) setAllFocus(days);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, allFocus, setAllFocus]);

  const focusLog = useMemo(() => mergeFocusLogs(allFocus || {}, focus?.log || {}), [allFocus, focus?.log]);
  const points = useMemo(() => pointsFrom({ tasks: tasks || [], habits: habits || [], focusLog }), [tasks, habits, focusLog]);
  const level = useMemo(() => levelFor(points.total), [points.total]);
  const loaded = Boolean(tasks && habits);

  return { ...points, ...level, shown: loaded && Boolean(allFocus || failed), ready: loaded && Boolean(allFocus) };
}
