import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudyRoomContext } from "./studyRoomContext";
import { useAuth } from "../hooks/useAuth";
import { useFocus } from "../hooks/useFocus";
import {
  checkIn,
  closeRoom,
  createRoom,
  declineInvite,
  findMyRoom,
  handOver,
  inviteFriend,
  joinRoom,
  leaveRoom,
  pauseRound,
  react,
  removeMember,
  resumeRound,
  setCallState,
  startRound,
  takeOver,
  watchInvites,
  watchMembers,
  watchRoom,
} from "../services/studyRooms";
import { CallEngine, SESSION, sweepMyLinks } from "../services/callEngine";
import { friendlyError } from "../utils/friendlyError";
import { HEARTBEAT_MS, MAX_ON_CALL, hostIsGone, nextHost, onCall } from "../utils/roomCall";
import RoomAudio from "../components/focus/RoomAudio";

const KEY = "u_do_room";
const NONE = [];
const NO_CALL = { local: { audio: false, video: null }, peers: [] };

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
  const [notice, setNotice] = useState("");
  const [call, setCall] = useState({ roomId: null, state: NO_CALL });
  const lastRound = useRef(null);
  const engine = useRef(null);

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

  // On a device that doesn't know your room yet — a second device, or after
  // the host handed over — look for your seat.
  const searched = useRef(null);
  useEffect(() => {
    if (!uid || roomId || searched.current === uid) return;
    searched.current = uid;
    findMyRoom(uid)
      .then((found) => found && enter(found))
      .catch(() => {});
  }, [uid, roomId, enter]);

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
      if (lastRound.current !== null && lastRound.current !== room.endsAt) {
        open?.();
        // Rounds are for studying: the mic goes quiet, and can come back on.
        if (engine.current?.audio) {
          engine.current.setMic(false).catch(() => {});
          setCallState(uid, room.id, { session: SESSION, cam: Boolean(engine.current.video), mic: false }).catch(() => {});
          setNotice("Mic muted for the focus round. Tap the mic to talk.");
        }
      }
      lastRound.current = room.endsAt;
    } else if (room.state === "paused" && room.left > 0) {
      follow({ room: room.id, minutes: room.minutes, paused: true, remainingMs: room.left });
      lastRound.current = "paused";
    } else {
      lastRound.current = room.state;
    }
  }, [room, follow, open, uid]);

  // Check in while in a room, so everyone can tell who's still here.
  useEffect(() => {
    if (!uid || !room?.id) return undefined;
    const beat = () => checkIn(uid, room.id).catch(() => {});
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [uid, room?.id]);

  // A host who left or went quiet is replaced by whoever has been here longest.
  // Everyone works it out; only that one person makes the change.
  useEffect(() => {
    if (!uid || !room || room.host === uid) return undefined;
    const check = () => {
      const now = Date.now();
      if (hostIsGone(members, room.host, now) && nextHost(members, room.host, now)?.uid === uid) {
        takeOver(user, room).catch(() => {});
      }
    };
    check();
    const timer = setInterval(check, 15_000);
    return () => clearInterval(timer);
  }, [uid, user, room, members]);

  // ---------------------------------------------------------------- the call
  const me = members.find((member) => member.uid === uid) || null;

  // Your seat vanished while the room is still there: the host removed you,
  // or you left from another device.
  const seated = useRef(null);
  useEffect(() => {
    if (!room) return;
    if (me) seated.current = room.id;
    else if (seated.current === room.id) {
      seated.current = null;
      unfollow?.(room.id);
      engine.current?.close();
      enter(null);
      setNotice("You're no longer in that study room.");
    }
  }, [room, me, unfollow, enter]);
  const callHere = Boolean(room && me?.session === SESSION);
  const callElsewhere = Boolean(room && me?.session && me.session !== SESSION);

  useEffect(() => {
    if (!callHere || !uid || !room?.id) return undefined;
    const roomKey = room.id;
    const current = new CallEngine({ roomId: roomKey, uid, onChange: (state) => setCall({ roomId: roomKey, state }) });
    engine.current = current;
    return () => {
      current.close();
      if (engine.current === current) engine.current = null;
      setCall({ roomId: null, state: NO_CALL });
    };
  }, [callHere, uid, room?.id]);

  // Connect to everyone else on the call; drop whoever left it.
  const others = useMemo(() => (callHere ? onCall(members).filter((member) => member.uid !== uid) : NONE), [callHere, members, uid]);
  useEffect(() => {
    engine.current?.sync(others);
  }, [others]);

  // Links left behind by a crashed tab are cleaned up once.
  useEffect(() => {
    if (!callHere || !uid || !room?.id) return;
    sweepMyLinks(room.id, uid, new Set([SESSION, ...others.map((member) => member.session)])).catch(() => {});
    // Only when joining; later changes are handled by sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callHere, uid, room?.id]);

  // Leaving the call when the call moves to another device.
  const wasHere = useRef(false);
  useEffect(() => {
    if (wasHere.current && callElsewhere) setNotice("The call moved to your other device.");
    wasHere.current = callHere;
  }, [callHere, callElsewhere]);

  const run = useCallback(async (task) => {
    setError("");
    try {
      return await task();
    } catch (error) {
      setError(friendlyError(error, "That didn't go through. Try again."));
      return null;
    }
  }, []);

  const isHost = Boolean(room && uid && room.host === uid);
  const callState = call.roomId === room?.id ? call.state : NO_CALL;

  const shareState = useCallback(
    (patch) => room && setCallState(uid, room.id, { session: SESSION, cam: Boolean(engine.current?.video), mic: Boolean(engine.current?.audio), ...patch }),
    [room, uid]
  );

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
      engine.current?.close();
      if (isHost) {
        // Someone else keeps the room going; if nobody's left, it closes.
        const next = nextHost(members, uid);
        if (next) await handOver(room, next);
        else {
          await closeRoom(room);
          enter(null);
          return;
        }
      }
      await leaveRoom(uid, room.id);
      enter(null);
    }),
    remove: (memberUid) => room && isHost && memberUid !== uid && run(() => removeMember(room, memberUid)),
    close: () => room && run(async () => {
      unfollow?.(room.id);
      engine.current?.close();
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
    // The call.
    call: callState,
    onCall: room ? onCall(members) : NONE,
    callHere,
    callElsewhere,
    notice,
    clearNotice: () => setNotice(""),
    joinCall: () => room && run(async () => {
      if (onCall(members).filter((member) => member.uid !== uid).length >= MAX_ON_CALL) {
        throw Object.assign(new Error(`The call is full — up to ${MAX_ON_CALL} people can be on it. The timer still works for you.`), { userFacing: true });
      }
      setNotice("");
      await setCallState(uid, room.id, { session: SESSION, cam: false, mic: false });
    }),
    leaveCall: () => room && run(async () => {
      engine.current?.close();
      await setCallState(uid, room.id, { session: null, cam: false, mic: false });
    }),
    toggleMic: () => engine.current && run(async () => {
      await engine.current.setMic(!engine.current.audio);
      setNotice("");
      await shareState({});
    }),
    toggleCam: () => engine.current && run(async () => {
      await engine.current.setCam(!engine.current.video);
      await shareState({});
    }),
  }), [room, members, invites, isHost, error, run, enter, user, uid, unfollow, callState, callHere, callElsewhere, notice, shareState]);

  return (
    <StudyRoomContext.Provider value={value}>
      {children}
      {/* Voices keep playing while you move around the app. */}
      <RoomAudio peers={callState.peers} />
    </StudyRoomContext.Provider>
  );
}
