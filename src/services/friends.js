import { deleteDoc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  friendDoc,
  friendsCollection,
  inviteCodeDoc,
  outgoingCollection,
  outgoingDoc,
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

export const isFriend = async (uid, otherUid) =>
  (await getDoc(friendDoc(uid, otherUid))).exists();

/** Every state two accounts can be in, so the UI never has to guess. */
export const RELATIONSHIP = {
  SELF: "self",
  FRIENDS: "friends",
  OUTGOING: "outgoing",
  INCOMING: "incoming",
  NONE: "none",
};

/**
 * What am I to this account right now?
 *
 * Checked in priority order: an existing friendship outranks a stale request
 * left behind by a failed cleanup, and an incoming request outranks an
 * outgoing one so the UI offers Accept rather than a second send.
 */
export const getRelationship = async (uid, targetUid) => {
  if (!uid || !targetUid) return RELATIONSHIP.NONE;
  if (uid === targetUid) return RELATIONSHIP.SELF;

  const [friends, incoming, outgoing] = await Promise.all([
    getDoc(friendDoc(uid, targetUid)).catch(() => null),
    getDoc(requestDoc(uid, targetUid)).catch(() => null),
    getDoc(outgoingDoc(uid, targetUid)).catch(() => null),
  ]);

  if (friends?.exists()) return RELATIONSHIP.FRIENDS;
  if (incoming?.exists()) return RELATIONSHIP.INCOMING;
  if (outgoing?.exists()) return RELATIONSHIP.OUTGOING;
  return RELATIONSHIP.NONE;
};

/**
 * Asks to be friends.
 *
 * Returns what actually happened, because two cases are not a plain send:
 * asking someone who already asked you is an accept, and asking someone twice
 * is a no-op rather than an error that resets the original request's age.
 */
export const sendFriendRequest = async (user, targetUid) => {
  if (targetUid === user.uid) throw new Error("That's your own profile.");

  const myProfile = await readProfile(user.uid);
  if (!myProfile?.username) {
    throw new Error("Claim a username first so they know who's asking.");
  }

  const relationship = await getRelationship(user.uid, targetUid);

  if (relationship === RELATIONSHIP.FRIENDS) {
    throw new Error("You're already friends.");
  }

  // They asked first: the honest response to "add them" is to accept.
  if (relationship === RELATIONSHIP.INCOMING) {
    await acceptFriendRequest(user, targetUid);
    return RELATIONSHIP.FRIENDS;
  }

  if (relationship === RELATIONSHIP.OUTGOING) {
    return RELATIONSHIP.OUTGOING;
  }

  await setDoc(requestDoc(targetUid, user.uid), {
    uid: user.uid,
    username: myProfile.username,
    displayName: myProfile.displayName,
    photoURL: myProfile.photoURL,
    createdAt: serverTimestamp(),
  });

  // The sender's own copy. Written after the request so a failure here leaves
  // a real request rather than a phantom "Pending" with nothing behind it.
  await setDoc(outgoingDoc(user.uid, targetUid), {
    uid: targetUid,
    createdAt: serverTimestamp(),
  });

  return RELATIONSHIP.OUTGOING;
};

/** Withdraws a request. The rules let the sender delete the recipient's copy. */
export const cancelFriendRequest = async (user, targetUid) => {
  await deleteDoc(requestDoc(targetUid, user.uid)).catch(() => {});
  await deleteDoc(outgoingDoc(user.uid, targetUid));
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
  const snap = await getDocs(outgoingCollection(uid));

  const rows = await Promise.all(
    snap.docs.map(async (item) => {
      const targetUid = item.id;
      const [profile, alreadyFriends] = await Promise.all([
        readProfile(targetUid).catch(() => null),
        isFriend(uid, targetUid).catch(() => false),
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

  // Clear the sender's "Pending" marker. Best-effort: the friendship is
  // already real, and listOutgoingRequests drops friends anyway.
  await deleteDoc(outgoingDoc(requesterUid, user.uid)).catch(() => {});
};

export const declineFriendRequest = async (user, requesterUid) => {
  await deleteDoc(requestDoc(user.uid, requesterUid));
  await deleteDoc(outgoingDoc(requesterUid, user.uid)).catch(() => {});
};

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

/**
 * Removes every friendship and pending request for this account, on both
 * sides. The handle, invite code and profile card are deliberately left alone:
 * clearing friends should not silently release a username someone else could
 * then take.
 */
export const clearFriendGraph = async (uid) => {
  const [friends, requests, outgoing] = await Promise.all([
    getDocs(friendsCollection(uid)),
    getDocs(requestsCollection(uid)),
    getDocs(outgoingCollection(uid)),
  ]);

  await Promise.all([
    ...friends.docs.map(async (item) => {
      await deleteDoc(friendDoc(uid, item.id));
      // The other side may already be gone; that is not a failure.
      await deleteDoc(friendDoc(item.id, uid)).catch(() => {});
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

  return { friends: friends.size, requests: requests.size, outgoing: outgoing.size };
};

/** Removes the shared streak card so friends stop seeing habit data. */
export const clearSharedSummary = (uid) => deleteDoc(sharedSummaryDoc(uid));

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
