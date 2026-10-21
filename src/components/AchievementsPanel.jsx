import { useEffect, useState } from "react";

import { useAuth } from "../hooks/useAuth";
import { loadEarned } from "../services/achievements";
import { BADGES } from "../utils/achievements";
import BadgeIcon from "./BadgeIcon";

const when = (key) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Every badge on Profile: earned ones with their date, the rest showing what they take. */
function AchievementsPanel() {
  const { user } = useAuth();
  const [state, setState] = useState({ uid: null, earned: {} });

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    loadEarned(user.uid).then((earned) => !cancelled && setState({ uid: user.uid, earned }));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || state.uid !== user.uid) return null;
  const count = BADGES.filter((b) => state.earned[b.id]).length;

  return (
    <article className="panel profile-card">
      <div className="panel-head">
        <h3 className="panel-title">Achievements</h3>
        <span className="panel-note">
          {count} of {BADGES.length}
        </span>
      </div>
      <ul className="badge-grid">
        {BADGES.map((badge) => {
          const at = state.earned[badge.id];
          return (
            <li key={badge.id} className={at ? "is-earned" : ""}>
              <span className="badge-icon">
                <BadgeIcon name={badge.icon} />
              </span>
              <strong>{badge.title}</strong>
              <small>{at ? when(at) : badge.detail}</small>
            </li>
          );
        })}
      </ul>
      <p className="panel-note">Friends see how many you&apos;ve earned. Once earned, a badge stays.</p>
    </article>
  );
}

export default AchievementsPanel;
