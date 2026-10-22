import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { loadFriendWeeks } from "../../services/leaderboard";
import { formatMinutes } from "../../utils/focusTimer";
import { rankWeek, weekKeyOf, weekMinutes } from "../../utils/leaderboard";

const NONE = [];

const initial = (name) => (name || "U").trim().charAt(0).toUpperCase();

/**
 * This week's focus time, you and your friends, most first. Resets every
 * Monday. Your own row comes from this device's view of your log, so it
 * moves the moment a session ends.
 */
function FocusLeaderboard() {
  const { user } = useAuth();
  const focus = useFocus();
  const [state, setState] = useState({ uid: null, friends: [] });

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    loadFriendWeeks(user.uid)
      .then((friends) => !cancelled && setState({ uid: user.uid, friends }))
      .catch(() => !cancelled && setState({ uid: user.uid, friends: [] }));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const week = weekKeyOf(new Date());
  const mine = Math.round(weekMinutes(focus?.log, new Date()));
  const friends = state.uid === user?.uid ? state.friends : NONE;

  const rows = useMemo(
    () => rankWeek([{ uid: user?.uid, name: "You", week, minutes: mine, isMe: true }, ...friends], week),
    [friends, mine, user?.uid, week]
  );

  if (!user || state.uid !== user.uid) return null;
  const top = Math.max(1, rows[0]?.minutes || 0);

  return (
    <section className="panel focus-leaderboard" aria-label="This week's focus leaderboard">
      <div className="panel-head">
        <h3 className="panel-title">This week</h3>
        <span className="panel-note">Resets Monday</span>
      </div>

      {friends.length ? (
        <ol className="leaderboard-list">
          {rows.map((row) => (
            <li key={row.uid} className={row.isMe ? "is-me" : ""}>
              <span className="leaderboard-rank">{row.rank}</span>
              {row.photoURL ? (
                <img src={row.photoURL} alt="" className="friend-avatar friend-avatar-image" />
              ) : (
                <span className="friend-avatar">{row.isMe ? initial(user.displayName) : initial(row.name)}</span>
              )}
              <span className="leaderboard-main">
                <strong>{row.name}</strong>
                <span className="leaderboard-bar" aria-hidden="true">
                  <i style={{ width: `${(row.minutes / top) * 100}%` }} />
                </span>
              </span>
              <span className="leaderboard-time">{formatMinutes(row.minutes)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="panel-note">
          You&apos;ve focused {formatMinutes(mine)} this week. <Link to="/friends">Add friends</Link> to see who studies most.
        </p>
      )}

      {!focus?.shareFocus && friends.length ? (
        <p className="panel-note">Friends can&apos;t see your time while sharing is off below.</p>
      ) : null}
    </section>
  );
}

export default FocusLeaderboard;
