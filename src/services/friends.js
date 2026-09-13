import { deleteDoc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  friendDoc,
  friendsCollection,
  inviteCodeDoc,
  profileDoc,
  requestDoc,
  requestsCollection,
  sharedSummaryDoc,
  usernameDoc,
} from "./paths";
import { buildHabitSummary } from "../utils/habitSummary";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

// No I, O, 0 or 1: invite codes get read aloud and typed by hand.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 8;

export const normalizeUsername = (value = "") => value.trim().toLowerCase().replace(/^@+/, "");

export const normalizeInviteCode = (value = "") => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export const validateUsername = (value) => {
  const username = normalizeUsername(value);
  if (!username) return "Pick a username first.";
  if (!USERNAME_PATTERN.test(username)) {
    return "3-20 characters: lowercase letters, numbers and underscores only.";
  }
  return "";
};

const generateInviteCode = () =>
  Array.from(
    { length: INVITE_CODE_LENGTH },
    () => INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]
  ).join("");

export const buildInviteLink = (code) => `${window.location.origin}/friends?add=${code}`;

const readProfile = async (uid) => {
  const snap = await getDoc(profileDoc(uid));
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    uid,
    username: data.username || "",
    displayName: data.displayName || "",
    photoURL: data.photoURL || "",
    inviteCode: data.inviteCode || "",
  };
};

export const getMyProfile = (uid) => readProfile(uid);

export const getPublicProfile = (uid) => readProfile(uid);

const describeUser = (user) => ({
  displayName: user.displayName || user.email?.split("@")[0] || "U.Do user",
  photoURL: user.photoURL || "",
});

/**
 * Claims a username for this account, creating the public profile card and an
 * invite code on the way. Renaming releases the previous username.
 */
export const claimUsername = async (user, requestedUsername) => {
  const username = normalizeUsername(requestedUsername);
  const validationError = validateUsername(username);
  if (validationError) throw new Error(validationError);

  const existing = await readProfile(user.uid);
  if (existing?.username === username) return existing;

  const inviteCode = existing?.inviteCode || generateInviteCode();

  await runTransaction(db, async (transaction) => {
    const nameRef = usernameDoc(username);
    const nameSnap = await transaction.get(nameRef);

    if (nameSnap.exists() && nameSnap.data()?.uid !== user.uid) {
      throw new Error(`@${username} is already taken.`);
    }

    transaction.set(nameRef, { uid: user.uid });
    transaction.set(inviteCodeDoc(inviteCode), { uid: user.uid });
    transaction.set(
      profileDoc(user.uid),
      { uid: user.uid, username, inviteCode, ...describeUser(user), updatedAt: serverTimestamp() },
      { merge: true }
    );

    if (existing?.username && existing.username !== username) {
      transaction.delete(usernameDoc(existing.username));
    }
  });

  return { uid: user.uid, username, inviteCode, ...describeUser(user) };
};

export const findUserByUsername = async (value) => {
  const username = normalizeUsername(value);
  if (validateUsername(username)) return null;

  const snap = await getDoc(usernameDoc(username));
  if (!snap.exists()) return null;

  return readProfile(snap.data().uid);
};

export const findUserByInviteCode = async (value) => {
  const code = normalizeInviteCode(value);
  if (!code) return null;

  const snap = await getDoc(inviteCodeDoc(code));
  if (!snap.exists()) return null;

  return readProfile(snap.data().uid);
};

export const isFriend = async (uid, otherUid) =>
  (await getDoc(friendDoc(uid, otherUid))).exists();

export const sendFriendRequest = async (user, targetUid) => {
  if (targetUid === user.uid) throw new Error("That's your own profile.");

  const myProfile = await readProfile(user.uid);
  if (!myProfile?.username) {
    throw new Error("Claim a username first so they know who's asking.");
  }

  if (await isFriend(user.uid, targetUid)) {
    throw new Error("You're already friends.");
  }

  await setDoc(requestDoc(targetUid, user.uid), {
    uid: user.uid,
    username: myProfile.username,
    displayName: myProfile.displayName,
    photoURL: myProfile.photoURL,
    createdAt: serverTimestamp(),
  });
};

export const listIncomingRequests = async (uid) => {
  const snap = await getDocs(requestsCollection(uid));
  return snap.docs.map((item) => ({ uid: item.id, ...item.data() }));
};

/**
 * Both sides of the friendship are written before the request is cleared: the
 * request doc is what proves to the security rules that the other person asked
 * to be added, so deleting it first would lock out the second write.
 */
export const acceptFriendRequest = async (user, requesterUid) => {
  await setDoc(friendDoc(user.uid, requesterUid), {
    uid: requesterUid,
    since: serverTimestamp(),
  });
  await setDoc(friendDoc(requesterUid, user.uid), {
    uid: user.uid,
    since: serverTimestamp(),
  });
  await deleteDoc(requestDoc(user.uid, requesterUid));
};

export const declineFriendRequest = (user, requesterUid) =>
  deleteDoc(requestDoc(user.uid, requesterUid));

export const removeFriend = async (user, friendUid) => {
  await deleteDoc(friendDoc(user.uid, friendUid));
  await deleteDoc(friendDoc(friendUid, user.uid));
};

/**
 * Publishes the shared card. No-op for anyone who has not claimed a username,
 * so accounts that never opted into friends write nothing readable by others.
 */
export const publishHabitSummary = async (user, habits, today = new Date()) => {
  const profile = await readProfile(user.uid);
  if (!profile?.username) return false;

  await setDoc(sharedSummaryDoc(user.uid), {
    ...buildHabitSummary(habits, today),
    updatedAt: serverTimestamp(),
  });

  return true;
};

export { buildHabitSummary };

export const getFriendSummary = async (friendUid) => {
  const snap = await getDoc(sharedSummaryDoc(friendUid));
  return snap.exists() ? snap.data() : null;
};

export const listFriends = async (uid) => {
  const snap = await getDocs(friendsCollection(uid));

  return Promise.all(
    snap.docs.map(async (item) => {
      const friendUid = item.id;
      const [profile, summary] = await Promise.all([
        readProfile(friendUid).catch(() => null),
        getFriendSummary(friendUid).catch(() => null),
      ]);

      return {
        uid: friendUid,
        username: profile?.username || "",
        displayName: profile?.displayName || "U.Do user",
        photoURL: profile?.photoURL || "",
        summary,
      };
    })
  );
};
