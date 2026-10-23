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

// Focus-timer time, one document per day. Not part of WORKSPACE_COLLECTIONS:
// it is a log the timer keeps, not something people create, import or export.
export const focusCollection = (uid) => collection(db, "users", uid, "focus");
export const focusDayDoc = (uid, dateKey) => doc(db, "users", uid, "focus", dateKey);

// "Studying now", shared with friends alongside the habit summary.
export const focusPresenceDoc = (uid) => doc(db, "profiles", uid, "shared", "focus");

// Exam countdowns.
export const examsCollection = (uid) => collection(db, "users", uid, "exams");
export const examDoc = (uid, id) => doc(db, "users", uid, "exams", id);

// Achievements, shared with friends next to the habit summary.
export const badgesDoc = (uid) => doc(db, "profiles", uid, "shared", "badges");

// Group study rooms: the host's timer, who joined, and invites under each
// invitee's profile. See firestore.rules.
export const roomsCollection = () => collection(db, "rooms");
export const roomDoc = (roomId) => doc(db, "rooms", roomId);
export const roomMembersCollection = (roomId) => collection(db, "rooms", roomId, "members");
export const roomMemberDoc = (roomId, uid) => doc(db, "rooms", roomId, "members", uid);
// Call signalling between two devices in a room.
export const roomLinksCollection = (roomId) => collection(db, "rooms", roomId, "links");
export const roomLinkDoc = (roomId, linkId) => doc(db, "rooms", roomId, "links", linkId);
export const roomLinkIceCollection = (roomId, linkId) => collection(db, "rooms", roomId, "links", linkId, "ice");
export const studyInvitesCollection = (uid) => collection(db, "profiles", uid, "studyInvites");
export const studyInviteDoc = (uid, roomId) => doc(db, "profiles", uid, "studyInvites", roomId);

// This week's focus total, for the friends leaderboard.
export const focusWeekDoc = (uid) => doc(db, "profiles", uid, "shared", "focusWeek");

// The class timetable and the grade tracker.
export const classesCollection = (uid) => collection(db, "users", uid, "classes");
export const classDoc = (uid, id) => doc(db, "users", uid, "classes", id);
export const gradesCollection = (uid) => collection(db, "users", uid, "grades");
export const gradeDoc = (uid, id) => doc(db, "users", uid, "grades", id);

// Settings that follow the person between devices (ADHD mode for now), and
// the switch that says whether a feature still being tried is open to them.
export const adhdPrefsDoc = (uid) => doc(db, "users", uid, "prefs", "adhd");
export const betaFeatureDoc = (feature) => doc(db, "betaFeatures", feature);
