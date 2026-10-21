import { deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import {
  roomDoc,
  roomMemberDoc,
  roomMembersCollection,
  roomsCollection,
  studyInviteDoc,
  studyInvitesCollection,
} from "./paths";

/**
 * Group study rooms. One person hosts and runs the timer; friends they invite
 * join and their timers follow the host's. The room carries only the timer
 * and names — never what anyone is studying.
 */

export const MAX_INVITES = 10;

/** Invites older than this are treated as stale and hidden. */
export const INVITE_TTL_MS = 12 * 60 * 60_000;

const nameOf = (user) => String(user?.displayName || user?.email?.split("@")[0] || "A friend").slice(0, 60);

export const createRoom = async (user, minutes) => {
  const ref = doc(roomsCollection());
  await setDoc(ref, {
    host: user.uid,
    hostName: nameOf(user),
    invited: [],
    state: "idle",
    endsAt: null,
    left: null,
    minutes: Math.min(180, Math.max(1, Math.round(minutes))),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(roomMemberDoc(ref.id, user.uid), { uid: user.uid, name: nameOf(user), joinedAt: serverTimestamp() });
  return ref.id;
};

/** Invites one friend. The room's `invited` list lets the host withdraw it later. */
export const inviteFriend = async (user, room, friendUid) => {
  if (room.invited.includes(friendUid) || room.invited.length >= MAX_INVITES) return;
  await setDoc(studyInviteDoc(friendUid, room.id), { host: user.uid, hostName: nameOf(user), createdAt: serverTimestamp() });
  await updateDoc(roomDoc(room.id), { invited: [...room.invited, friendUid], updatedAt: serverTimestamp() });
};

export const joinRoom = (user, roomId) =>
  setDoc(roomMemberDoc(roomId, user.uid), { uid: user.uid, name: nameOf(user), joinedAt: serverTimestamp() });

/** Leaving also drops the invite, so the room disappears from this person's list. */
export const leaveRoom = async (uid, roomId) => {
  await deleteDoc(roomMemberDoc(roomId, uid)).catch(() => {});
  await deleteDoc(studyInviteDoc(uid, roomId)).catch(() => {});
};

export const declineInvite = (uid, roomId) => deleteDoc(studyInviteDoc(uid, roomId));

/** Withdraws every invite, clears the members, then the room itself. */
export const closeRoom = async (room) => {
  await Promise.all(room.invited.map((friendUid) => deleteDoc(studyInviteDoc(friendUid, room.id)).catch(() => {})));
  const members = await getDocs(roomMembersCollection(room.id)).catch(() => null);
  await Promise.all((members?.docs || []).map((item) => deleteDoc(item.ref).catch(() => {})));
  await deleteDoc(roomDoc(room.id));
};

// The host's timer controls. Everyone else follows these through watchRoom.
export const startRound = (roomId, minutes, now = Date.now()) =>
  updateDoc(roomDoc(roomId), { state: "focus", minutes, endsAt: now + minutes * 60_000, left: null, updatedAt: serverTimestamp() });

export const pauseRound = (room, now = Date.now()) =>
  updateDoc(roomDoc(room.id), { state: "paused", left: Math.max(0, Math.round(room.endsAt - now)), endsAt: null, updatedAt: serverTimestamp() });

export const resumeRound = (room, now = Date.now()) =>
  updateDoc(roomDoc(room.id), { state: "focus", endsAt: now + (room.left || 0), left: null, updatedAt: serverTimestamp() });

/** Calls back with the room, or null once it is closed or out of reach. */
export const watchRoom = (roomId, callback) =>
  onSnapshot(
    roomDoc(roomId),
    (snap) => callback(snap.exists() ? { id: snap.id, invited: [], ...snap.data() } : null),
    () => callback(null)
  );

export const watchMembers = (roomId, callback) =>
  onSnapshot(
    roomMembersCollection(roomId),
    (snap) => callback(snap.docs.map((item) => ({ uid: item.id, name: item.data().name || "A friend" }))),
    () => callback([])
  );

/** This person's open invites, newest first, without stale ones. */
export const watchInvites = (uid, callback) =>
  onSnapshot(
    studyInvitesCollection(uid),
    (snap) => {
      const now = Date.now();
      const invites = snap.docs
        .map((item) => ({ roomId: item.id, ...item.data(), at: item.data().createdAt?.toMillis?.() || now }))
        .filter((invite) => now - invite.at < INVITE_TTL_MS)
        .sort((a, b) => b.at - a.at);
      callback(invites);
    },
    () => callback([])
  );
