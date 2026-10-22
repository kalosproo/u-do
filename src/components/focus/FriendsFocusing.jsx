import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { listFriends } from "../../services/friends";
import { readPresence } from "../../services/focusSync";

const REFRESH_MS = 60_000;

const minutesLeft = (endsAt, now) => Math.max(1, Math.ceil((endsAt - now) / 60_000));

/**
 * Friends who are in a focus session right now, and how long they have left.
 * Only that: friends share "focusing until", never what they're studying.
 * Checked once a minute while the page is open.
 */
function FriendsFocusing({ compact = false }) {
  const { user } = useAuth();
  const [state, setState] = useState({ uid: null, friends: [], focusing: [] });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const friends = await listFriends(user.uid);
        const checked = await Promise.all(
          friends.map(async (friend) => ({ ...friend, presence: await readPresence(friend.uid) }))
        );
        if (!cancelled) {
          setState({ uid: user.uid, friends, focusing: checked.filter((friend) => friend.presence) });
          setNow(Date.now());
        }
      } catch {
        if (!cancelled) setState({ uid: user.uid, friends: [], focusing: [] });
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  if (!user || state.uid !== user.uid) return null;
  if (compact && state.focusing.length === 0) return null;

  return (
    <section className="panel friends-focusing" aria-label="Friends studying now">
      <div className="panel-head">
        <h3 className="panel-title">Studying now</h3>
        <span className="panel-note">
          {state.focusing.length ? `${state.focusing.length} of ${state.friends.length} friends` : ""}
        </span>
      </div>

      {state.focusing.length ? (
        <ul className="friends-focusing-list">
          {state.focusing.map((friend) => (
            <li key={friend.uid}>
              {friend.photoURL ? (
                <img src={friend.photoURL} alt="" className="friend-avatar friend-avatar-image" />
              ) : (
                <span className="friend-avatar">{(friend.displayName || "U").trim().charAt(0).toUpperCase()}</span>
              )}
              <span className="friends-focusing-name">
                <strong>{friend.displayName}</strong>
                <small>{minutesLeft(friend.presence.endsAt, now)} min left</small>
              </span>
              <span className="friends-focusing-dot" aria-hidden="true" />
            </li>
          ))}
        </ul>
      ) : state.friends.length ? (
        <p className="panel-note">None of your friends are focusing right now. Start a session and they&apos;ll see you here.</p>
      ) : (
        <p className="panel-note">
          Add friends to see when they&apos;re studying. <Link to="/friends">Find friends</Link>
        </p>
      )}
    </section>
  );
}

export default FriendsFocusing;
