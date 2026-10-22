import { collectionGroup, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

import {
  roomDoc,
  roomLinkIceCollection,
  roomLinksCollection,
  roomMemberDoc,
  roomMembersCollection,
  roomsCollection,
  studyInviteDoc,
  studyInvitesCollection,
} from "./paths";
import { db } from "./firebase";

/**
 * Group study rooms. One person hosts and runs the timer; friends they invite
 * join and their timers follow the host's. The room carries only the timer
 * and names — never what anyone is studying.
 */

export const MAX_INVITES = 10;

/** The only reactions a room allows — icons, never text. Mirrors the rules. */
export const REACTIONS = ["thumbs", "zap", "coffee", "star", "heart", "moon"];

/** How long a reaction stays on screen. */
export const REACTION_MS = 6000;

/** Invites older than this are treated as stale and hidden. */
export const INVITE_TTL_MS = 12 * 60 * 60_000;

const nameOf = (user) => String(user?.displayName || user?.email?.split("@")[0] || "A friend").slice(0, 60);

// A fresh seat: here now, not on the call yet.
const seat = (user) => ({
  uid: user.uid,
  name: nameOf(user),
  joinedAt: serverTimestamp(),
  seenAt: serverTimestamp(),
  session: null,
  cam: false,
  mic: false,
});

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
  await setDoc(roomMemberDoc(ref.id, user.uid), seat(user));
  return ref.id;
};

/** Invites one friend. The room's `invited` list lets the host withdraw it later. */
export const inviteFriend = async (user, room, friendUid) => {
  if (room.invited.includes(friendUid) || room.invited.length >= MAX_INVITES) return;
  await setDoc(studyInviteDoc(friendUid, room.id), { host: user.uid, hostName: nameOf(user), createdAt: serverTimestamp() });
  await updateDoc(roomDoc(room.id), { invited: [...room.invited, friendUid], updatedAt: serverTimestamp() });
};

/** Joining again (say from a second device) keeps your place in the queue to host. */
export const joinRoom = async (user, roomId) => {
  const mine = await getDoc(roomMemberDoc(roomId, user.uid)).catch(() => null);
  if (mine?.exists()) await updateDoc(roomMemberDoc(roomId, user.uid), { seenAt: serverTimestamp() });
  else await setDoc(roomMemberDoc(roomId, user.uid), seat(user));
};

/** The room you're in, found from any device: your newest seat whose room still exists. */
export const findMyRoom = async (uid) => {
  const snap = await getDocs(query(collectionGroup(db, "members"), where("uid", "==", uid)));
  const seats = snap.docs.sort((a, b) => (b.data().joinedAt?.toMillis?.() || 0) - (a.data().joinedAt?.toMillis?.() || 0));
  for (const item of seats) {
    const roomId = item.ref.parent.parent?.id;
    if (roomId && (await getDoc(roomDoc(roomId)).catch(() => null))?.exists()) return roomId;
  }
  return null;
};

/** "Still here" — what lets the room notice a host whose app has gone away. */
export const checkIn = (uid, roomId) => updateDoc(roomMemberDoc(roomId, uid), { seenAt: serverTimestamp() });

/** Which device this person is on the call from, and what they're sharing. */
export const setCallState = (uid, roomId, { session, cam, mic }) =>
  updateDoc(roomMemberDoc(roomId, uid), { session: session || null, cam: Boolean(cam), mic: Boolean(mic), seenAt: serverTimestamp() });

/** The host passes the room to someone still in it. */
export const handOver = (room, member) =>
  updateDoc(roomDoc(room.id), { host: member.uid, hostName: String(member.name || "A friend").slice(0, 60), updatedAt: serverTimestamp() });

/** Taking over from a host who left or went quiet. The rules check they did. */
export const takeOver = (user, room) =>
  updateDoc(roomDoc(room.id), { host: user.uid, hostName: nameOf(user), updatedAt: serverTimestamp() });

/** The host removes someone: their seat and their invite go, so they can't walk back in. */
export const removeMember = async (room, uid) => {
  await deleteDoc(studyInviteDoc(uid, room.id)).catch(() => {});
  await deleteDoc(roomMemberDoc(room.id, uid));
};

/** Leaving also drops the invite, so the room disappears from this person's list. */
export const leaveRoom = async (uid, roomId) => {
  await deleteDoc(roomMemberDoc(roomId, uid)).catch(() => {});
  await deleteDoc(studyInviteDoc(uid, roomId)).catch(() => {});
};

export const react = (uid, roomId, reaction) =>
  REACTIONS.includes(reaction) ? updateDoc(roomMemberDoc(roomId, uid), { reaction, reactedAt: serverTimestamp() }) : Promise.resolve();

export const declineInvite = (uid, roomId) => deleteDoc(studyInviteDoc(uid, roomId));

/** Withdraws every invite, clears the call links and members, then the room itself. */
export const closeRoom = async (room) => {
  await Promise.all(room.invited.map((friendUid) => deleteDoc(studyInviteDoc(friendUid, room.id)).catch(() => {})));
  const links = await getDocs(roomLinksCollection(room.id)).catch(() => null);
  await Promise.all(
    (links?.docs || []).map(async (link) => {
      const ice = await getDocs(roomLinkIceCollection(room.id, link.id)).catch(() => null);
      await Promise.all((ice?.docs || []).map((item) => deleteDoc(item.ref).catch(() => {})));
      await deleteDoc(link.ref).catch(() => {});
    })
  );
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
    (snap) =>
      callback(
        snap.docs.map((item) => {
          // A write still on its way has no server time yet; estimate it.
          const data = item.data({ serverTimestamps: "estimate" });
          return {
            uid: item.id,
            name: data.name || "A friend",
            joinedAt: data.joinedAt?.toMillis?.() || 0,
            seenAt: data.seenAt?.toMillis?.() || 0,
            session: typeof data.session === "string" ? data.session : null,
            cam: data.cam === true,
            mic: data.mic === true,
            reaction: REACTIONS.includes(data.reaction) ? data.reaction : null,
            // A local write has no server time yet; count it as now.
            reactedAt: data.reaction ? data.reactedAt?.toMillis?.() || Date.now() : 0,
          };
        })
      ),
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
