import { collection, doc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Every Firestore path the app uses, in one place. These strings used to be
 * repeated inline across the pages, where a typo reads an empty collection
 * instead of failing.
 */

// Private workspace, readable only by its owner.
export const WORKSPACE_COLLECTIONS = ["tasks", "planner", "expenses", "habits"];

export const workspaceCollection = (uid, name) => collection(db, "users", uid, name);
export const workspaceDoc = (uid, name, id) => doc(db, "users", uid, name, id);

export const tasksCollection = (uid) => workspaceCollection(uid, "tasks");
export const taskDoc = (uid, id) => workspaceDoc(uid, "tasks", id);

export const plannerCollection = (uid) => workspaceCollection(uid, "planner");
export const plannerDoc = (uid, id) => workspaceDoc(uid, "planner", id);

export const expensesCollection = (uid) => workspaceCollection(uid, "expenses");
export const expenseDoc = (uid, id) => workspaceDoc(uid, "expenses", id);

export const habitsCollection = (uid) => workspaceCollection(uid, "habits");
export const habitDoc = (uid, id) => workspaceDoc(uid, "habits", id);

// Friends. The public card is readable by any signed-in account; the shared
// summary only by friends. See firestore.rules.
export const profileDoc = (uid) => doc(db, "profiles", uid);
export const sharedSummaryDoc = (uid) => doc(db, "profiles", uid, "shared", "summary");
export const friendsCollection = (uid) => collection(db, "profiles", uid, "friends");
export const friendDoc = (uid, friendUid) => doc(db, "profiles", uid, "friends", friendUid);
export const requestsCollection = (uid) => collection(db, "profiles", uid, "requests");
export const requestDoc = (uid, fromUid) => doc(db, "profiles", uid, "requests", fromUid);

// A request is stored on the recipient, who is the only one allowed to read
// it. Without a mirror the sender cannot see — let alone withdraw — what they
// sent, so each send also writes here, under the sender's own profile.
export const outgoingCollection = (uid) => collection(db, "profiles", uid, "outgoing");
export const outgoingDoc = (uid, toUid) => doc(db, "profiles", uid, "outgoing", toUid);
export const usernameDoc = (username) => doc(db, "usernames", username);
export const inviteCodeDoc = (code) => doc(db, "inviteCodes", code);
