import { useEffect, useState } from "react";
import { FiPause, FiPlay, FiUsers } from "react-icons/fi";

import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { useStudyRoom } from "../../hooks/useStudyRoom";
import { listMutuals } from "../../services/friends";
import { MAX_INVITES } from "../../services/studyRooms";
import { formatClock } from "../../utils/focusTimer";
import RoomReactions from "./RoomReactions";

const LENGTHS = [25, 50, 90];

const initial = (name) => (name || "U").trim().charAt(0).toUpperCase();

/**
 * Group study: open a room, invite friends, and run one timer for everyone.
 * Invitees see the invite here and join with one tap.
 */
function StudyRoom({ compact = false }) {
  const { user } = useAuth();
  const focus = useFocus();
  const study = useStudyRoom();
  const [friends, setFriends] = useState(null);
  const [minutes, setMinutes] = useState(() => (LENGTHS.includes(focus?.setup?.minutes) ? focus.setup.minutes : 25));
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const room = study?.room;
  const isHost = study?.isHost;

  // Friends to invite, loaded once the host opens a room.
  useEffect(() => {
    if (!user || !isHost) return undefined;
    let cancelled = false;
    listMutuals(user.uid)
      .then((list) => !cancelled && setFriends(list))
      .catch(() => !cancelled && setFriends([]));
    return () => {
      cancelled = true;
    };
  }, [user, isHost]);

  useEffect(() => {
    if (room?.state !== "focus") return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [room?.state]);

  if (!user || !study) return null;
  // On Home it shows up only when there is something to act on.
  if (compact && !room && study.invites.length === 0) return null;

  const act = async (task) => {
    setBusy(true);
    await task();
    setBusy(false);
  };

  if (!room) {
    return (
      <section className="panel study-room" aria-label="Study room">
        <div className="panel-head">
          <h3 className="panel-title">
            <FiUsers aria-hidden="true" /> Study room
          </h3>
        </div>

        {study.invites.length ? (
          <ul className="study-invites">
            {study.invites.map((invite) => (
              <li key={invite.roomId}>
                <span className="friend-avatar">{initial(invite.hostName)}</span>
                <span className="study-invite-text">
                  <strong>{invite.hostName}</strong> invited you to study together
                </span>
                <span className="study-invite-actions">
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => act(() => study.decline(invite))}>
                    Decline
                  </button>
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => act(() => study.join(invite))}>
                    Join
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {compact ? null : (
          <>
        <p className="panel-note">Study in sync with friends. You run the timer; theirs starts, pauses and ends with yours.</p>
        <div className="study-room-start">
          <div className="study-lengths" role="group" aria-label="Round length">
            {LENGTHS.map((value) => (
              <button key={value} type="button" className={minutes === value ? "is-active" : ""} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>
                {value}m
              </button>
            ))}
          </div>
          <button data-tip="room" type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => study.create(minutes))}>
            Open a room
          </button>
        </div>
          </>
        )}
        {study.error ? <p className="login-error">{study.error}</p> : null}
      </section>
    );
  }

  const running = room.state === "focus" && room.endsAt > now;
  const paused = room.state === "paused";
  const status = running
    ? `Round on · ${formatClock(room.endsAt - now)} left`
    : paused
      ? `Paused · ${formatClock(room.left)} left`
      : isHost
        ? "Ready when you are"
        : `Waiting for ${room.hostName} to start`;
  const others = room.invited.length;

  return (
    <section className="panel study-room is-live" aria-label="Study room">
      <div className="panel-head">
        <h3 className="panel-title">
          <FiUsers aria-hidden="true" /> {isHost ? "Your study room" : `${room.hostName}'s room`}
        </h3>
        <span className="panel-note">{status}</span>
      </div>

      <ul className="study-members" aria-label="In the room">
        {study.members.map((member) => (
          <li key={member.uid} title={member.name}>
            <span className="friend-avatar">{initial(member.name)}</span>
            <small>{member.uid === user.uid ? "You" : member.name.split(" ")[0]}</small>
          </li>
        ))}
      </ul>

      <RoomReactions />

      {isHost ? (
        <>
          <div className="study-room-start">
            {running || paused ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(study.toggle)}>
                {paused ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />} {paused ? "Resume for everyone" : "Pause for everyone"}
              </button>
            ) : (
              <>
                <div className="study-lengths" role="group" aria-label="Round length">
                  {LENGTHS.map((value) => (
                    <button key={value} type="button" className={minutes === value ? "is-active" : ""} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>
                      {value}m
                    </button>
                  ))}
                </div>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => study.start(minutes))}>
                  <FiPlay aria-hidden="true" /> Start round
                </button>
              </>
            )}
          </div>

          <div className="study-invite-list">
            <p className="panel-note">
              Invite friends {others ? `· ${others} invited` : ""}
            </p>
            {friends === null ? (
              <p className="panel-note">Loading friends…</p>
            ) : friends.length === 0 ? (
              <p className="panel-note">Only mutuals can join — people you follow who follow you back.</p>
            ) : (
              <ul>
                {friends.map((friend) => {
                  const sent = room.invited.includes(friend.uid);
                  return (
                    <li key={friend.uid}>
                      <span className="friend-avatar">{initial(friend.displayName)}</span>
                      <span>{friend.displayName}</span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy || sent || others >= MAX_INVITES}
                        onClick={() => act(() => study.invite(friend.uid))}
                      >
                        {sent ? "Invited" : "Invite"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button type="button" className="focus-link" disabled={busy} onClick={() => act(study.close)}>
            Close the room
          </button>
        </>
      ) : (
        <button type="button" className="focus-link" disabled={busy} onClick={() => act(study.leave)}>
          Leave the room
        </button>
      )}
      {study.error ? <p className="login-error">{study.error}</p> : null}
    </section>
  );
}

export default StudyRoom;
