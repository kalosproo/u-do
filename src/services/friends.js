import { deleteDoc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  followerDoc,
  followersCollection,
  followingCollection,
  followingDoc,
  friendDoc,
  friendsCollection,
  inviteCodeDoc,
  outgoingCollection,
  outgoingDoc,
  badgesDoc,
  profileDoc,
  requestDoc,
  requestsCollection,
  sharedSummaryDoc,
  usernameDoc,
} from "./paths";
import { buildHabitSummary } from "../utils/habitSummary";

/**
 * The canonical form of a username: lowercase, 3-20 of [a-z0-9_].
 *
 * This exact expression is mirrored in firestore.rules, which refuses any
 * usernames/{id} document whose id does not match — so the ledger cannot be
 * polluted with non-canonical ids that lookups would never find.
 */
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Why a claim failed, so the UI can say something specific. */
export const CLAIM_ERRORS = {
  INVALID: "username/invalid",
  TAKEN: "username/taken",
  DENIED: "username/denied",
  UNAVAILABLE: "username/unavailable",
  EXHAUSTED: "username/code-exhausted",
};

const claimError = (reason, message) => Object.assign(new Error(message), { reason });

/** Turns a Firestore failure into one of ours, so callers never read raw codes. */
const translateFirestoreError = (error) => {
  if (error?.reason) return error;

  if (error?.code === "permission-denied") {
    return claimError(
      CLAIM_ERRORS.DENIED,
      "You don't have permission to do that. If this keeps happening the Firestore rules may not be deployed."
    );
  }

  if (error?.code === "unavailable" || error?.code === "deadline-exceeded") {
    return claimError(CLAIM_ERRORS.UNAVAILABLE, "Couldn't reach the server. Check your connection and try again.");
  }

  return claimError(CLAIM_ERRORS.UNAVAILABLE, error?.message || "Something went wrong. Please try again.");
};

// No I, O, 0 or 1: invite codes get read aloud and typed by hand.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 8;

/**
 * The one canonical form, used for storing, claiming and looking up alike.
 * Strips a leading @, collapses case, and trims on both sides of the @ so
 * " @Haneesh " and "haneesh" are the same handle.
 */
export const normalizeUsername = (value = "") =>
  String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .trim()
    .toLowerCase();

export const normalizeInviteCode = (value = "") => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export const validateUsername = (value) => {
  const username = normalizeUsername(value);

  if (!username) return "Pick a username first.";
  if (username.length < USERNAME_MIN) return `Usernames need at least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX) return `Usernames can be at most ${USERNAME_MAX} characters.`;
  if (!USERNAME_PATTERN.test(username)) {
    return "Use letters, numbers and underscores only — no spaces or symbols.";
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

/** Retries only the rules-lag case; a genuine denial still surfaces. */
const writeProfileCard = async (user, username, inviteCode) => {
  const card = {
    uid: user.uid,
    username,
    inviteCode,
    ...describeUser(user),
    updatedAt: serverTimestamp(),
  };

  for (let attempt = 0; ; attempt += 1) {
    try {
      await setDoc(profileDoc(user.uid), card, { merge: true });
      return;
    } catch (error) {
      if (error?.code !== "permission-denied" || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 120 * 2 ** attempt));
    }
  }
};

const describeUser = (user) => ({
  displayName: user.displayName || user.email?.split("@")[0] || "U.Do user",
  photoURL: user.photoURL || "",
});

/**
 * Claims a username for this account, creating the public profile card and an
 * invite code on the way. Renaming releases the previous username.
 */
/**
 * Claims a username for this account.
 *
 * Uniqueness is enforced by the usernames/{canonical} ledger, not by a
 * client-side "is it free?" query: the check and the write happen inside one
 * transaction, so two accounts racing for the same handle cannot both win —
 * the loser re-runs, sees the document, and is rejected. firestore.rules backs
 * this up by refusing to let anyone create a ledger entry that already exists
 * or update one they do not own, so the constraint holds even against a client
 * writing to Firestore directly.
 *
 * The ledger is claimed first and the profile card written second, rather than
 * both in one transaction. Rules evaluate get()/exists() against the state
 * *before* a transaction, so a rule binding the card's username to the ledger
 * could never see an entry created in the same transaction. Writing second
 * means the binding is checkable. If the second write fails the ledger entry is
 * still yours and re-claiming finishes the job, so no handle is left stranded
 * under another account.
 */
export const claimUsername = async (user, requestedUsername) => {
  const username = normalizeUsername(requestedUsername);
  const validationError = validateUsername(username);

  if (validationError) throw claimError(CLAIM_ERRORS.INVALID, validationError);

  // A fresh invite code may collide, astronomically rarely. Reading it inside
  // the transaction turns that into a retry rather than a stolen code.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateCode = generateInviteCode();

    try {
      const result = await runTransaction(db, async (transaction) => {
        const [nameSnap, profileSnap] = await Promise.all([
          transaction.get(usernameDoc(username)),
          transaction.get(profileDoc(user.uid)),
        ]);

        const profile = profileSnap.exists() ? profileSnap.data() : null;
        const previousUsername = profile?.username || "";

        if (nameSnap.exists() && nameSnap.data()?.uid !== user.uid) {
          throw claimError(CLAIM_ERRORS.TAKEN, `@${username} is already taken.`);
        }

        // Already yours: report it rather than writing the same thing again.
        if (previousUsername === username && nameSnap.exists()) {
          return { username, inviteCode: profile?.inviteCode || "", previousUsername, alreadyYours: true };
        }

        const inviteCode = profile?.inviteCode || candidateCode;

        if (!profile?.inviteCode) {
          const codeSnap = await transaction.get(inviteCodeDoc(inviteCode));

          if (codeSnap.exists() && codeSnap.data()?.uid !== user.uid) {
            throw claimError(CLAIM_ERRORS.EXHAUSTED, "retry with another invite code");
          }

          transaction.set(inviteCodeDoc(inviteCode), { uid: user.uid });
        }

        transaction.set(usernameDoc(username), { uid: user.uid });

        // Releasing the old handle rides in the same transaction, so a rename
        // can never hold two entries or drop both.
        if (previousUsername && previousUsername !== username) {
          transaction.delete(usernameDoc(previousUsername));
        }

        return { username, inviteCode, previousUsername, alreadyYours: false };
      });

      if (result.alreadyYours) {
        return {
          profile: { uid: user.uid, ...describeUser(user), username, inviteCode: result.inviteCode },
          alreadyYours: true,
          previousUsername: result.previousUsername,
        };
      }

      // Second phase: the card. The ledger entry above is committed, but the
      // rule that checks it does its own get(), which can briefly still be
      // looking at the state just before the commit — under contention that
      // surfaces as permission-denied on a write we are entitled to make. We
      // hold the handle at this point, so give it a moment and try again
      // rather than failing a claim that actually succeeded.
      await writeProfileCard(user, username, result.inviteCode);

      return {
        profile: { uid: user.uid, ...describeUser(user), username, inviteCode: result.inviteCode },
        alreadyYours: false,
        previousUsername: result.previousUsername,
      };
    } catch (error) {
      const translated = translateFirestoreError(error);

      if (translated.reason === CLAIM_ERRORS.EXHAUSTED) continue;

      // Under contention Firestore aborts the transaction before our own check
      // runs, which would otherwise surface as a vague network error. Settle it
      // by reading the ledger: if the handle now belongs to someone else, the
      // honest answer is that it was taken.
      if (translated.reason === CLAIM_ERRORS.UNAVAILABLE) {
        const holder = await getDoc(usernameDoc(username)).catch(() => null);

        if (holder?.exists() && holder.data()?.uid !== user.uid) {
          throw claimError(CLAIM_ERRORS.TAKEN, `@${username} is already taken.`);
        }
      }

      throw translated;
    }
  }

  throw claimError(CLAIM_ERRORS.EXHAUSTED, "Couldn't generate a unique invite code. Please try again.");
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

const exists = (ref) => getDoc(ref).then((snap) => snap.exists()).catch(() => false);

/**
 * Where two accounts stand, Instagram-style. An older two-way friendship
 * counts as following both ways until it is carried over.
 */
export const getRelationship = async (uid, targetUid) => {
  const none = { self: false, following: false, followedBy: false, requested: false, incoming: false };
  if (!uid || !targetUid) return none;
  if (uid === targetUid) return { ...none, self: true };

  const [following, followedBy, legacy, incoming, requested] = await Promise.all([
    exists(followingDoc(uid, targetUid)),
    exists(followerDoc(uid, targetUid)),
    exists(friendDoc(uid, targetUid)),
    exists(requestDoc(uid, targetUid)),
    exists(outgoingDoc(uid, targetUid)),
  ]);

  return {
    self: false,
    following: following || legacy,
    followedBy: followedBy || legacy,
    // A stale marker for someone already followed is not a pending request.
    requested: requested && !(following || legacy),
    incoming: incoming && !(followedBy || legacy),
  };
};

export const isMutual = (relationship) => relationship.following && relationship.followedBy;

/**
 * Asks to follow someone. Every account is private, so this is always a
 * request they accept; asking twice changes nothing.
 */
export const sendFollowRequest = async (user, targetUid) => {
  if (targetUid === user.uid) throw new Error("That's your own profile.");

  const myProfile = await readProfile(user.uid);
  if (!myProfile?.username) {
    throw new Error("Claim a username first so they know who's asking.");
  }

  const relationship = await getRelationship(user.uid, targetUid);
  if (relationship.following || relationship.requested) return relationship;

  await setDoc(requestDoc(targetUid, user.uid), {
    uid: user.uid,
    username: myProfile.username,
    displayName: myProfile.displayName,
    photoURL: myProfile.photoURL,
    createdAt: serverTimestamp(),
  });

  // The sender's own copy, so "Requested" shows and can be withdrawn.
  // Best-effort: the request itself already went through.
  await setDoc(outgoingDoc(user.uid, targetUid), {
    uid: targetUid,
    createdAt: serverTimestamp(),
  }).catch((error) => {
    if (error?.code !== "permission-denied") throw error;
  });

  return { ...relationship, requested: true };
};

/** Withdraws a request. The rules let the sender delete the recipient's copy. */
export const cancelFriendRequest = async (user, targetUid) => {
  // The recipient's copy is the one that matters — removing it is what
  // actually withdraws the request. The mirror is only this account's index.
  await deleteDoc(requestDoc(targetUid, user.uid));
  await deleteDoc(outgoingDoc(user.uid, targetUid)).catch((error) => {
    if (error?.code !== "permission-denied") throw error;
  });
};

export const listIncomingRequests = async (uid) => {
  const snap = await getDocs(requestsCollection(uid));
  return snap.docs.map((item) => ({ uid: item.id, ...item.data() }));
};

/**
 * Requests this account has sent and not yet had answered.
 *
 * The mirror can outlive the request it tracks if the recipient's cleanup
 * failed, so anyone already a friend is filtered out here rather than shown
 * as perpetually pending.
 */
export const listOutgoingRequests = async (uid) => {
  // The mirror is the newest collection here, so it is the most likely to be
  // unreadable on a deployment whose rules predate it. Sent requests are the
  // least important part of this page; degrade to an empty list rather than
  // taking the incoming requests and friends down with it.
  const snap = await getDocs(outgoingCollection(uid)).catch((error) => {
    if (error?.code === "permission-denied") return null;
    throw error;
  });

  if (!snap) return [];

  const rows = await Promise.all(
    snap.docs.map(async (item) => {
      const targetUid = item.id;
      const [profile, alreadyFriends] = await Promise.all([
        readProfile(targetUid).catch(() => null),
        exists(followingDoc(uid, targetUid)),
      ]);

      if (alreadyFriends) {
        await deleteDoc(outgoingDoc(uid, targetUid)).catch(() => {});
        return null;
      }

      return {
        uid: targetUid,
        username: profile?.username || "",
        displayName: profile?.displayName || "U.Do user",
        photoURL: profile?.photoURL || "",
      };
    })
  );

  return rows.filter(Boolean);
};

/**
 * Approves someone's request to follow. Both records are written before the
 * request is cleared: the request is what lets the rules accept them.
 */
export const acceptFollowRequest = async (user, requesterUid) => {
  await setDoc(followerDoc(user.uid, requesterUid), { uid: requesterUid, since: serverTimestamp() });
  await setDoc(followingDoc(requesterUid, user.uid), { uid: user.uid, since: serverTimestamp() });
  await deleteDoc(requestDoc(user.uid, requesterUid));
  await deleteDoc(outgoingDoc(requesterUid, user.uid)).catch(() => {});
};

export const declineFollowRequest = async (user, requesterUid) => {
  await deleteDoc(requestDoc(user.uid, requesterUid));
  await deleteDoc(outgoingDoc(requesterUid, user.uid)).catch(() => {});
};

/** Removes an older two-way friendship, both halves; either may already be gone. */
const dropLegacy = (uid, otherUid) =>
  Promise.all([
    deleteDoc(friendDoc(uid, otherUid)).catch(() => {}),
    deleteDoc(friendDoc(otherUid, uid)).catch(() => {}),
  ]);

/** Stops following someone. They keep following you if they did. */
export const unfollow = async (user, targetUid) => {
  const relationship = await getRelationship(user.uid, targetUid);
  // An older friendship becomes "they follow you" before the unfollow, so
  // unfollowing doesn't also cut them off from you.
  if (await exists(friendDoc(user.uid, targetUid))) await carryOver(user.uid, targetUid);
  await deleteDoc(followingDoc(user.uid, targetUid)).catch(() => {});
  await deleteDoc(followerDoc(targetUid, user.uid)).catch(() => {});
  return { ...relationship, following: false };
};

/** Removes a follower. You keep following them if you did. */
export const removeFollower = async (user, followerUid) => {
  if (await exists(friendDoc(user.uid, followerUid))) await carryOver(user.uid, followerUid);
  await deleteDoc(followerDoc(user.uid, followerUid)).catch(() => {});
  await deleteDoc(followingDoc(followerUid, user.uid)).catch(() => {});
};

/**
 * Turns an older two-way friendship into following both ways, then deletes
 * the old records. Only when both halves are there; a one-sided leftover is
 * left alone.
 */
const carryOver = async (uid, otherUid) => {
  const theirs = await exists(friendDoc(otherUid, uid));
  if (!theirs) return false;
  const stamp = { since: serverTimestamp(), legacy: true };
  await setDoc(followerDoc(uid, otherUid), { uid: otherUid, ...stamp });
  await setDoc(followingDoc(otherUid, uid), { uid, ...stamp });
  await setDoc(followingDoc(uid, otherUid), { uid: otherUid, ...stamp });
  await setDoc(followerDoc(otherUid, uid), { uid, ...stamp });
  await dropLegacy(uid, otherUid);
  return true;
};

/** Carries every older friendship over. Safe to run on every visit. */
export const carryOverFriends = async (uid) => {
  const snap = await getDocs(friendsCollection(uid)).catch(() => null);
  let moved = 0;
  for (const item of snap?.docs || []) {
    if (await carryOver(uid, item.id).catch(() => false)) moved += 1;
  }
  return moved;
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

/**
 * Removes every friendship and pending request for this account, on both
 * sides. The handle, invite code and profile card are deliberately left alone:
 * clearing friends should not silently release a username someone else could
 * then take.
 */
export const clearFriendGraph = async (uid) => {
  const [friends, requests, outgoing, followers, following] = await Promise.all([
    getDocs(friendsCollection(uid)),
    getDocs(requestsCollection(uid)),
    getDocs(outgoingCollection(uid)),
    getDocs(followersCollection(uid)),
    getDocs(followingCollection(uid)),
  ]);

  await Promise.all([
    ...friends.docs.map(async (item) => {
      await deleteDoc(friendDoc(uid, item.id));
      // The other side may already be gone; that is not a failure.
      await deleteDoc(friendDoc(item.id, uid)).catch(() => {});
    }),
    ...followers.docs.map(async (item) => {
      await deleteDoc(followerDoc(uid, item.id));
      await deleteDoc(followingDoc(item.id, uid)).catch(() => {});
    }),
    ...following.docs.map(async (item) => {
      await deleteDoc(followingDoc(uid, item.id));
      await deleteDoc(followerDoc(item.id, uid)).catch(() => {});
    }),
    ...requests.docs.map(async (item) => {
      await deleteDoc(requestDoc(uid, item.id));
      // Also clear the asker's pending marker, so they stop seeing "Pending"
      // for a request that no longer exists.
      await deleteDoc(outgoingDoc(item.id, uid)).catch(() => {});
    }),
    ...outgoing.docs.map(async (item) => {
      await deleteDoc(outgoingDoc(uid, item.id));
      await deleteDoc(requestDoc(item.id, uid)).catch(() => {});
    }),
  ]);

  return {
    friends: friends.size + followers.size + following.size,
    requests: requests.size,
    outgoing: outgoing.size,
  };
};

/** Removes the shared streak card so friends stop seeing habit data. */
export const clearSharedSummary = (uid) => deleteDoc(sharedSummaryDoc(uid));

const card = async (otherUid, { withSummary = false } = {}) => {
  const [profile, summary, badges] = await Promise.all([
    readProfile(otherUid).catch(() => null),
    withSummary ? getFriendSummary(otherUid).catch(() => null) : null,
    withSummary
      ? getDoc(badgesDoc(otherUid)).then((snap) => (snap.exists() ? snap.data().badges || {} : {})).catch(() => ({}))
      : {},
  ]);
  return {
    uid: otherUid,
    username: profile?.username || "",
    displayName: profile?.displayName || "U.Do user",
    photoURL: profile?.photoURL || "",
    summary,
    badgeCount: Object.keys(badges || {}).length,
  };
};

const idsOf = async (ref) => (await getDocs(ref)).docs.map((item) => item.id);

/** Who this account follows and who follows it, older friendships counted both ways. */
const graphOf = async (uid) => {
  const [following, followers, legacy] = await Promise.all([
    idsOf(followingCollection(uid)).catch(() => []),
    idsOf(followersCollection(uid)).catch(() => []),
    idsOf(friendsCollection(uid)).catch(() => []),
  ]);
  return {
    following: new Set([...following, ...legacy]),
    followers: new Set([...followers, ...legacy]),
  };
};

/** People this account follows, with their streaks and badges (followers may see those). */
export const listFollowing = async (uid) => {
  const { following, followers } = await graphOf(uid);
  return Promise.all(
    [...following].map(async (id) => ({ ...(await card(id, { withSummary: true })), mutual: followers.has(id) }))
  );
};

/** People who follow this account. */
export const listFollowers = async (uid) => {
  const { following, followers } = await graphOf(uid);
  return Promise.all([...followers].map(async (id) => ({ ...(await card(id)), mutual: following.has(id) })));
};

/** Mutuals: study rooms, the leaderboard and "studying now" are for them. */
export const listMutuals = async (uid) => {
  const { following, followers } = await graphOf(uid);
  const ids = [...following].filter((id) => followers.has(id));
  return Promise.all(ids.map((id) => card(id, { withSummary: true })));
};

/** Streak cards: everyone you follow. Kept under its old name for callers. */
export const listFriends = listFollowing;

/**
 * "Followed by asha and 2 others": people you follow who follow them. Read
 * through your own following's lists, which you can see because you follow
 * them — never through the other person's private list.
 */
export const mutualFollowersOf = async (uid, targetUid, limit = 30) => {
  const { following } = await graphOf(uid);
  following.delete(targetUid);
  const checks = await Promise.all(
    [...following].slice(0, limit).map(async (id) => ((await exists(followingDoc(id, targetUid))) ? id : null))
  );
  const ids = checks.filter(Boolean);
  const named = await Promise.all(ids.slice(0, 2).map((id) => readProfile(id).catch(() => null)));
  return {
    count: ids.length,
    names: named.map((profile) => profile?.username || profile?.displayName).filter(Boolean),
  };
};
