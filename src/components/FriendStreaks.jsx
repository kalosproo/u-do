import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listFriends } from "../services/friends";
import { useAuth } from "../hooks/useAuth";

/**
 * Friends' shared habit cards, for any page that wants them.
 *
 * This used to live only on the Friends page, so accepting someone and then
 * going to Habits or the dashboard showed nothing of theirs. The read is the
 * same one Friends makes — a friend's card is only readable while their own
 * friend list names you, so this grants no extra visibility.
 *
 * `limit` trims the list for the dashboard; `compact` drops the per-habit rows
 * and shows just the headline, for tighter panels.
 */
function FriendStreaks({ limit = 0, compact = false }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setFriends(await listFriends(user.uid));
      setFailed(false);
    } catch {
      // A friends read can fail on its own (rules, network). That must not
      // take down the page this is embedded in.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (loading) return <p className="friends-muted">Loading friends...</p>;

  if (failed) {
    return <p className="friends-muted">Couldn&apos;t load your friends right now.</p>;
  }

  if (friends.length === 0) {
    return (
      <p className="friends-muted">
        No friends yet. <Link to="/friends">Add someone</Link> to compare streaks.
      </p>
    );
  }

  const shown = limit ? friends.slice(0, limit) : friends;

  return (
    <div className="friend-streak-list">
      {shown.map((friend) => (
        <article key={friend.uid} className="friend-streak-card">
          <header className="friend-streak-head">
            {friend.photoURL ? (
              <img src={friend.photoURL} alt="" className="friend-avatar friend-avatar-image" />
            ) : (
              <span className="friend-avatar">
                {(friend.displayName || friend.username || "U").trim().charAt(0).toUpperCase()}
              </span>
            )}

            <div className="friends-result-meta">
              <strong>{friend.displayName}</strong>
              {friend.username ? <small>@{friend.username}</small> : null}
            </div>

            {friend.summary ? (
              <span className="friend-streak-headline">
                <strong>{friend.summary.longestStreak}</strong>
                <small>best</small>
              </span>
            ) : null}
          </header>

          {!friend.summary ? (
            <p className="friends-muted">Nothing shared yet.</p>
          ) : friend.summary.totalCount === 0 ? (
            <p className="friends-muted">No habits tracked yet.</p>
          ) : (
            <>
              <p className="friends-muted">
                {friend.summary.doneCount} of {friend.summary.totalCount} done this window
              </p>

              {compact ? null : (
                <div className="friend-habit-list">
                  {friend.summary.habits.map((habit) => (
                    <div key={habit.id} className="friend-habit-row">
                      <span className="friend-habit-title">{habit.title}</span>
                      <span className="friend-habit-rate">{habit.completionRate}%</span>
                      <span className="friend-habit-streak">
                        {habit.streak} {habit.frequency === "weekly" ? "wks" : "days"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </div>
  );
}

export default FriendStreaks;
