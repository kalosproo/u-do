import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudyRoomContext } from "./studyRoomContext";
import { useAuth } from "../hooks/useAuth";
import { useFocus } from "../hooks/useFocus";
import {
  closeRoom,
  createRoom,
  declineInvite,
  inviteFriend,
  joinRoom,
  leaveRoom,
  pauseRound,
  react,
  resumeRound,
  startRound,
  watchInvites,
  watchMembers,
  watchRoom,
} from "../services/studyRooms";

const KEY = "u_do_room";
const NONE = [];

const readSaved = (uid) => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    return saved?.uid === uid ? saved.roomId : null;
  } catch {
    return null;
  }
};

const save = (uid, roomId) => {
  try {
    if (roomId) localStorage.setItem(KEY, JSON.stringify({ uid, roomId }));
    else localStorage.removeItem(KEY);
  } catch {
    /* The room still works for this visit. */
  }
};

/**
 * The study room this person is in, if any, and their open invites. While
 * in a room the focus timer follows the host's: a new round opens the timer
 * for everyone, and pausing pauses everyone.
 */
export function StudyRoomProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const focus = useFocus();
  // Each piece of state remembers whose (or which room's) it is, so a stale
  // value from a previous account or room is never shown.
  const [picked, setPicked] = useState({ uid: null, roomId: null });
  const [roomState, setRoomState] = useState({ roomId: null, room: null, members: [] });
  const [inviteState, setInviteState] = useState({ uid: null, list: [] });
  const [error, setError] = useState("");
  const lastRound = useRef(null);

  const roomId = uid ? (picked.uid === uid ? picked.roomId : readSaved(uid)) : null;
  const room = roomId && roomState.roomId === roomId ? roomState.room : null;
  const members = roomId && roomState.roomId === roomId ? roomState.members : NONE;
  const invites = uid && inviteState.uid === uid ? inviteState.list : NONE;

  const enter = useCallback((id) => {
    save(uid, id);
    setPicked({ uid, roomId: id });
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    return watchInvites(uid, (list) => setInviteState({ uid, list }));
  }, [uid]);

  // The room and who is in it, live.
  const { follow, unfollow, open } = focus || {};
  useEffect(() => {
    lastRound.current = null;
    if (!uid || !roomId) return undefined;
    const stopRoom = watchRoom(roomId, (next) => {
      if (!next) {
        // Closed by the host, or no longer reachable.
        unfollow?.(roomId);
        save(uid, null);
        setPicked({ uid, roomId: null });
        return;
      }
      setRoomState((current) => ({ roomId, room: next, members: current.roomId === roomId ? current.members : [] }));
    });
    const stopMembers = watchMembers(roomId, (list) =>
      setRoomState((current) => ({ roomId, room: current.roomId === roomId ? current.room : null, members: list }))
    );
    return () => {
      stopRoom();
      stopMembers();
    };
  }, [uid, roomId, unfollow]);

  // Everyone's timer follows the room's.
  useEffect(() => {
    if (!room || !follow) return;
    if (room.state === "focus" && room.endsAt > Date.now()) {
      follow({ room: room.id, minutes: room.minutes, endsAt: room.endsAt });
      if (lastRound.current !== null && lastRound.current !== room.endsAt) open?.();
      lastRound.current = room.endsAt;
    } else if (room.state === "paused" && room.left > 0) {
      follow({ room: room.id, minutes: room.minutes, paused: true, remainingMs: room.left });
      lastRound.current = "paused";
    } else {
      lastRound.current = room.state;
    }
  }, [room, follow, open]);

  const run = useCallback(async (task) => {
    setError("");
    try {
      return await task();
    } catch {
      setError("That didn't go through. Check your connection and try again.");
      return null;
    }
  }, []);

  const isHost = Boolean(room && uid && room.host === uid);

  const value = useMemo(() => ({
    room,
    members,
    invites,
    isHost,
    error,
    create: (minutes) => run(async () => enter(await createRoom(user, minutes))),
    invite: (friendUid) => room && run(() => inviteFriend(user, room, friendUid)),
    join: (invite) => run(async () => {
      await joinRoom(user, invite.roomId);
      enter(invite.roomId);
    }),
    decline: (invite) => run(() => declineInvite(uid, invite.roomId)),
    leave: () => room && run(async () => {
      unfollow?.(room.id);
      await leaveRoom(uid, room.id);
      enter(null);
    }),
    close: () => room && run(async () => {
      unfollow?.(room.id);
      await closeRoom(room);
      enter(null);
    }),
    start: (minutes) => room && run(() => startRound(room.id, minutes)),
    react: (reaction) => room && run(() => react(uid, room.id, reaction)),
    toggle: () => {
      if (!room) return null;
      if (room.state === "paused") return run(() => resumeRound(room));
      if (room.state === "focus" && room.endsAt > Date.now()) return run(() => pauseRound(room));
      return null;
    },
  }), [room, members, invites, isHost, error, run, enter, user, uid, unfollow]);

  return <StudyRoomContext.Provider value={value}>{children}</StudyRoomContext.Provider>;
}
