import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../hooks/useAuth";
import { loadEarned, saveEarned } from "../services/achievements";
import { BADGES, newlyEarned } from "../utils/achievements";
import { toDateKey } from "../utils/dateKeys";
import BadgeIcon from "./BadgeIcon";

const SHOW_MS = 4200;

/**
 * Checks the numbers Home already has against the badges, records any new
 * ones, and announces each with a short unlock card. Renders nothing else.
 */
function AchievementWatcher({ stats, ready }) {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const checked = useRef("");

  useEffect(() => {
    if (!user || !ready) return undefined;
    const key = `${user.uid}|${JSON.stringify(stats)}`;
    if (checked.current === key) return undefined;
    checked.current = key;
    let cancelled = false;

    (async () => {
      const stored = await loadEarned(user.uid);
      const fresh = newlyEarned(stats, stored);
      if (!fresh.length || cancelled) return;
      const today = toDateKey(new Date());
      try {
        await saveEarned(user.uid, Object.fromEntries(fresh.map((id) => [id, today])));
      } catch {
        return; // Announce only what was actually kept.
      }
      if (!cancelled) setQueue((current) => [...current, ...fresh]);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, ready, stats]);

  useEffect(() => {
    if (!queue.length) return undefined;
    const timer = setTimeout(() => setQueue((current) => current.slice(1)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [queue]);

  const badge = BADGES.find((b) => b.id === queue[0]);
  if (!badge) return null;

  return createPortal(
    <div className="badge-toast" role="status" key={badge.id}>
      <span className="badge-toast-icon">
        <BadgeIcon name={badge.icon} />
      </span>
      <span className="badge-toast-text">
        <small>Achievement unlocked</small>
        <strong>{badge.title}</strong>
        <span>{badge.detail}</span>
      </span>
    </div>,
    document.body
  );
}

export default AchievementWatcher;
