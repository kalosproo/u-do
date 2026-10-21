// Security-rule tests for firestore.rules.
//
//   npm i --no-save @firebase/rules-unit-testing firebase-tools
//   npx firebase emulators:exec --only firestore --project u-do-rules-test \
//     "node firestore.rules.test.mjs"
//
// Requires a JDK for the emulator. Run this after any edit to firestore.rules:
// a mistake here is the difference between friends seeing your streaks and
// strangers seeing them.
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, increment, deleteDoc, collection, getDocs, updateDoc } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "u-do-rules-test",
  firestore: { rules: readFileSync(new URL("./firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});

const ALICE = "alice_uid", BOB = "bob_uid", MALLORY = "mallory_uid";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const mallory = env.authenticatedContext(MALLORY).firestore();
const anon = env.unauthenticatedContext().firestore();
// The admin console's identity is a custom claim, so the rules can only be
// tested with one attached. ADMIN_PHASE1.md flagged these cases as worth
// adding and never ran them.
const admin = env.authenticatedContext("admin_uid", { admin: true, adminRole: "owner" }).firestore();

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); pass += 1; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e).split("\n")[0]}`); fail += 1; }
};

const seed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    for (const [uid, name] of [[ALICE,"alice"],[BOB,"bob"],[MALLORY,"mallory"]]) {
      await setDoc(doc(d,"profiles",uid), { uid, username:name, displayName:name, inviteCode:`CODE${name.toUpperCase()}` });
      await setDoc(doc(d,"usernames",name), { uid });
      await setDoc(doc(d,"inviteCodes",`CODE${name.toUpperCase()}`), { uid });
      await setDoc(doc(d,"profiles",uid,"shared","summary"), { habits:[{title:"secret habit"}], longestStreak:9 });
      await setDoc(doc(d,"users",uid,"habits","h1"), { title:"private habit", logs:{} });
    }
  });
};

console.log("\n=== private workspace stays private ===");
await seed();
await t("owner reads own habits", () => assertSucceeds(getDoc(doc(alice,"users",ALICE,"habits","h1"))));
await t("friend-to-be CANNOT read raw habits", () => assertFails(getDoc(doc(bob,"users",ALICE,"habits","h1"))));
await t("stranger CANNOT read raw habits", () => assertFails(getDoc(doc(mallory,"users",ALICE,"habits","h1"))));
await t("stranger CANNOT write raw habits", () => assertFails(setDoc(doc(mallory,"users",ALICE,"habits","h1"),{title:"x"})));

console.log("\n=== shared summary is friends-only ===");
await t("non-friend CANNOT read shared summary", () => assertFails(getDoc(doc(bob,"profiles",ALICE,"shared","summary"))));
await t("owner reads own summary", () => assertSucceeds(getDoc(doc(alice,"profiles",ALICE,"shared","summary"))));
await t("non-friend CANNOT write someone's summary", () => assertFails(setDoc(doc(mallory,"profiles",ALICE,"shared","summary"),{habits:[]})));

console.log("\n=== public card is discoverable, not writable ===");
await t("signed-in reads public card", () => assertSucceeds(getDoc(doc(bob,"profiles",ALICE))));
await t("signed-in resolves username", () => assertSucceeds(getDoc(doc(bob,"usernames","alice"))));
await t("signed-in resolves invite code", () => assertSucceeds(getDoc(doc(bob,"inviteCodes","CODEALICE"))));
await t("stranger CANNOT edit your card", () => assertFails(setDoc(doc(mallory,"profiles",ALICE),{displayName:"hacked"})));
await t("logged-out CANNOT read cards", () => assertFails(getDoc(doc(anon,"profiles",ALICE))));
await t("CANNOT steal a taken username", () => assertFails(setDoc(doc(mallory,"usernames","alice"),{uid:MALLORY})));
await t("CAN claim a free username", () => assertSucceeds(setDoc(doc(mallory,"usernames","freename"),{uid:MALLORY})));
await t("CANNOT claim a username for someone else", () => assertFails(setDoc(doc(mallory,"usernames","other"),{uid:ALICE})));

console.log("\n=== the full request -> accept handshake ===");
await seed();
await t("alice sends bob a request", () => assertSucceeds(setDoc(doc(alice,"profiles",BOB,"requests",ALICE),{uid:ALICE,username:"alice"})));
await t("CANNOT forge a request from someone else", () => assertFails(setDoc(doc(mallory,"profiles",BOB,"requests",ALICE),{uid:ALICE})));
await t("CANNOT send a request claiming another uid", () => assertFails(setDoc(doc(mallory,"profiles",BOB,"requests",MALLORY),{uid:ALICE})));
await t("bob reads his inbox", () => assertSucceeds(getDocs(collection(bob,"profiles",BOB,"requests"))));
await t("mallory CANNOT read bob's inbox", () => assertFails(getDocs(collection(mallory,"profiles",BOB,"requests"))));
await t("bob accepts: adds alice to his list", () => assertSucceeds(setDoc(doc(bob,"profiles",BOB,"friends",ALICE),{uid:ALICE})));
await t("bob accepts: adds himself to alice's list (request proves consent)",
  () => assertSucceeds(setDoc(doc(bob,"profiles",ALICE,"friends",BOB),{uid:BOB})));
await t("bob clears the request", () => assertSucceeds(deleteDoc(doc(bob,"profiles",BOB,"requests",ALICE))));
await t("NOW bob can read alice's summary", () => assertSucceeds(getDoc(doc(bob,"profiles",ALICE,"shared","summary"))));
await t("alice can read bob's summary", () => assertSucceeds(getDoc(doc(alice,"profiles",BOB,"shared","summary"))));
await t("mallory still CANNOT read alice's summary", () => assertFails(getDoc(doc(mallory,"profiles",ALICE,"shared","summary"))));
await t("mallory STILL cannot read alice's raw habits", () => assertFails(getDoc(doc(mallory,"users",ALICE,"habits","h1"))));

console.log("\n=== the attack: self-add without consent ===");
await seed();
await t("mallory CANNOT add herself to alice's friend list", () => assertFails(setDoc(doc(mallory,"profiles",ALICE,"friends",MALLORY),{uid:MALLORY})));
await t("...so she still cannot read the summary", () => assertFails(getDoc(doc(mallory,"profiles",ALICE,"shared","summary"))));
await t("mallory CANNOT add a third party to alice's list", () => assertFails(setDoc(doc(mallory,"profiles",ALICE,"friends",BOB),{uid:BOB})));

console.log("\n=== unfriending ===");
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(),"profiles",ALICE,"friends",BOB),{uid:BOB});
  await setDoc(doc(ctx.firestore(),"profiles",BOB,"friends",ALICE),{uid:ALICE});
});
await t("bob reads alice's summary while friends", () => assertSucceeds(getDoc(doc(bob,"profiles",ALICE,"shared","summary"))));
await t("alice removes bob from her list", () => assertSucceeds(deleteDoc(doc(alice,"profiles",ALICE,"friends",BOB))));
await t("bob can no longer read alice's summary", () => assertFails(getDoc(doc(bob,"profiles",ALICE,"shared","summary"))));
await t("alice can remove herself from bob's list too", () => assertSucceeds(deleteDoc(doc(alice,"profiles",BOB,"friends",ALICE))));

console.log("\n=== outgoing request mirror ===");
await seed();
await t("alice writes her own outgoing marker", () => assertSucceeds(setDoc(doc(alice,"profiles",ALICE,"outgoing",BOB),{uid:BOB})));
await t("alice reads her own outgoing list", () => assertSucceeds(getDocs(collection(alice,"profiles",ALICE,"outgoing"))));
await t("bob CANNOT read alice's outgoing list", () => assertFails(getDocs(collection(bob,"profiles",ALICE,"outgoing"))));
await t("mallory CANNOT read alice's outgoing list", () => assertFails(getDocs(collection(mallory,"profiles",ALICE,"outgoing"))));
await t("mallory CANNOT plant a marker on alice", () => assertFails(setDoc(doc(mallory,"profiles",ALICE,"outgoing",MALLORY),{uid:MALLORY})));
await t("alice CANNOT write a marker whose uid lies about the target", () => assertFails(setDoc(doc(alice,"profiles",ALICE,"outgoing",BOB),{uid:MALLORY})));
await t("bob (the recipient) CAN clear alice's marker for him", () => assertSucceeds(deleteDoc(doc(bob,"profiles",ALICE,"outgoing",BOB))));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(),"profiles",ALICE,"outgoing",BOB),{uid:BOB});
});
await t("mallory CANNOT clear a marker that isn't about her", () => assertFails(deleteDoc(doc(mallory,"profiles",ALICE,"outgoing",BOB))));
await t("alice withdraws her own marker", () => assertSucceeds(deleteDoc(doc(alice,"profiles",ALICE,"outgoing",BOB))));

console.log("\n=== sender can withdraw the request itself ===");
await seed();
await t("alice sends bob a request", () => assertSucceeds(setDoc(doc(alice,"profiles",BOB,"requests",ALICE),{uid:ALICE})));
await t("alice withdraws it from bob's inbox", () => assertSucceeds(deleteDoc(doc(alice,"profiles",BOB,"requests",ALICE))));
await t("mallory CANNOT withdraw alice's request", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(),"profiles",BOB,"requests",ALICE),{uid:ALICE});
  });
  await assertFails(deleteDoc(doc(mallory,"profiles",BOB,"requests",ALICE)));
});

console.log("\n=== rate limit collection is closed to clients ===");
await t("client CANNOT read authRateLimits", () => assertFails(getDoc(doc(alice,"authRateLimits","ip:1.2.3.4"))));
await t("client CANNOT write authRateLimits", () => assertFails(setDoc(doc(alice,"authRateLimits","ip:1.2.3.4"),{count:0})));
await t("unknown collections are closed", () => assertFails(setDoc(doc(alice,"randomStuff","x"),{a:1})));

console.log("\n=== consent records are per-account and permanent ===");
await seed();
await t("alice records her own consent", () =>
  assertSucceeds(setDoc(doc(alice,"consents",ALICE),{uid:ALICE,privacyVersion:1,acceptedAt:new Date()})));
await t("alice reads her own consent", () => assertSucceeds(getDoc(doc(alice,"consents",ALICE))));
await t("mallory CANNOT record consent as alice", () =>
  assertFails(setDoc(doc(mallory,"consents",ALICE),{uid:ALICE,privacyVersion:1})));
await t("alice CANNOT write a record whose uid lies", () =>
  assertFails(setDoc(doc(alice,"consents",ALICE),{uid:BOB,privacyVersion:1})));
await t("a non-integer version is refused", () =>
  assertFails(setDoc(doc(alice,"consents",ALICE),{uid:ALICE,privacyVersion:"one"})));
await t("mallory CANNOT read alice's consent", () => assertFails(getDoc(doc(mallory,"consents",ALICE))));
await t("an admin CAN read a consent record", () => assertSucceeds(getDoc(doc(admin,"consents",ALICE))));
await t("nobody can delete a consent record", () => assertFails(deleteDoc(doc(alice,"consents",ALICE))));
await t("an anonymous visitor CANNOT write one", () =>
  assertFails(setDoc(doc(anon,"consents",ALICE),{uid:ALICE,privacyVersion:1})));

console.log("\n=== the admin claim opens operations, never content ===");
await seed();
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d,"billing",ALICE), { uid:ALICE, planId:"free" });
  await setDoc(doc(d,"adminAuditLogs","log1"), { action:"admin.grant" });
  await setDoc(doc(d,"activityEvents","ev1"), { type:"task.completed", uid:ALICE });
  await setDoc(doc(d,"usageCounters",ALICE), { uid:ALICE, counters:{} });
});
await t("an admin reads billing", () => assertSucceeds(getDoc(doc(admin,"billing",ALICE))));
await t("a non-admin CANNOT read someone else's billing", () => assertFails(getDoc(doc(mallory,"billing",ALICE))));
await t("the owner reads their own billing", () => assertSucceeds(getDoc(doc(alice,"billing",ALICE))));
await t("an admin CANNOT read a person's habits", () => assertFails(getDoc(doc(admin,"users",ALICE,"habits","h1"))));
await t("an admin CANNOT read a person's shared summary", () => assertFails(getDoc(doc(admin,"profiles",ALICE,"shared","summary"))));
await t("an admin reads activityEvents", () => assertSucceeds(getDoc(doc(admin,"activityEvents","ev1"))));
await t("a non-admin CANNOT read activityEvents", () => assertFails(getDoc(doc(mallory,"activityEvents","ev1"))));
await t("an admin reads the audit log", () => assertSucceeds(getDoc(doc(admin,"adminAuditLogs","log1"))));
await t("even an admin CANNOT write the audit log", () =>
  assertFails(setDoc(doc(admin,"adminAuditLogs","log2"),{action:"forged"})));
await t("nobody can promote themselves in billing", () =>
  assertFails(setDoc(doc(alice,"billing",ALICE),{uid:ALICE,planId:"pro"})));
await t("nobody can reset their own usage counters", () =>
  assertFails(setDoc(doc(alice,"usageCounters",ALICE),{uid:ALICE,counters:{}})));

console.log("\n=== push tokens are owner-only, admins included ===");
await seed();
await t("alice stores her own push subscription", () =>
  assertSucceeds(setDoc(doc(alice,"pushSubscriptions",ALICE),{uid:ALICE,enabled:true,tokens:{tok1:true}})));
await t("alice reads her own subscription", () => assertSucceeds(getDoc(doc(alice,"pushSubscriptions",ALICE))));
await t("mallory CANNOT read alice's push tokens", () => assertFails(getDoc(doc(mallory,"pushSubscriptions",ALICE))));
await t("an admin CANNOT read push tokens either", () => assertFails(getDoc(doc(admin,"pushSubscriptions",ALICE))));
await t("mallory CANNOT write alice's subscription", () =>
  assertFails(setDoc(doc(mallory,"pushSubscriptions",ALICE),{uid:ALICE,enabled:true})));
await t("a record whose uid lies is refused", () =>
  assertFails(setDoc(doc(alice,"pushSubscriptions",ALICE),{uid:BOB,enabled:true})));
await t("alice can delete her own subscription", () => assertSucceeds(deleteDoc(doc(alice,"pushSubscriptions",ALICE))));

console.log("\n=== a transaction is checked field by field ===");
await seed();

// The shape the app writes. Each case below changes exactly one thing.
const TXN = Object.freeze({
  id: "e1",
  title: "Groceries",
  amountMinor: 1235,
  amount: 12.35,
  currency: "INR",
  type: "expense",
  category: "Needs",
  date: "2026-09-30",
  createdAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:00:00.000Z",
});

const txn = (patch) => ({ ...TXN, ...patch });
const write = (as, uid, id, body) => setDoc(doc(as, "users", uid, "expenses", id), body);

await t("owner writes a well-formed transaction", () => assertSucceeds(write(alice, ALICE, "e1", TXN)));
await t("owner reads own transactions", () => assertSucceeds(getDocs(collection(alice,"users",ALICE,"expenses"))));
await t("stranger CANNOT read someone's transactions", () => assertFails(getDocs(collection(mallory,"users",ALICE,"expenses"))));
await t("stranger CANNOT write someone's transactions", () => assertFails(write(mallory, ALICE, "e2", TXN)));

// Money. The whole point of the change these rules came with.
await t("amountMinor CANNOT be fractional", () => assertFails(write(alice, ALICE, "e2", txn({ amountMinor: 12.35 }))));
await t("amountMinor CANNOT be a string", () => assertFails(write(alice, ALICE, "e2", txn({ amountMinor: "1235" }))));
await t("amountMinor CANNOT be zero", () => assertFails(write(alice, ALICE, "e2", txn({ amountMinor: 0, amount: 0 }))));
await t("amountMinor CANNOT be negative", () => assertFails(write(alice, ALICE, "e2", txn({ amountMinor: -1235, amount: -12.35 }))));
await t("amountMinor CANNOT exceed the ledger's range", () =>
  assertFails(write(alice, ALICE, "e2", txn({ amountMinor: 10000000001, amount: 100000000.01 }))));
await t("amountMinor is required", () => {
  const body = txn({});
  delete body.amountMinor;
  return assertFails(write(alice, ALICE, "e2", body));
});

// The mirror is what the reader prefers when the two disagree, so it is
// bounded too — otherwise it is a way straight past the bound above.
await t("the major-unit mirror CANNOT be unbounded", () =>
  assertFails(write(alice, ALICE, "e2", txn({ amount: 1e12 }))));
await t("the major-unit mirror CANNOT be a string", () => assertFails(write(alice, ALICE, "e2", txn({ amount: "12.35" }))));

await t("currency must be one we know", () => assertFails(write(alice, ALICE, "e2", txn({ currency: "ZZZ" }))));
await t("currency is required", () => {
  const body = txn({});
  delete body.currency;
  return assertFails(write(alice, ALICE, "e2", body));
});

await t("type must be expense or income", () => assertFails(write(alice, ALICE, "e2", txn({ type: "transfer" }))));
await t("income is a valid type", () => assertSucceeds(write(alice, ALICE, "e3", txn({ type: "income", category: "Salary" }))));

await t("title CANNOT be empty", () => assertFails(write(alice, ALICE, "e2", txn({ title: "" }))));
await t("title CANNOT be unbounded", () => assertFails(write(alice, ALICE, "e2", txn({ title: "x".repeat(121) }))));
await t("a title at the limit is fine", () => assertSucceeds(write(alice, ALICE, "e4", txn({ title: "x".repeat(120) }))));
await t("category CANNOT be empty", () => assertFails(write(alice, ALICE, "e2", txn({ category: "" }))));
await t("category CANNOT be unbounded", () => assertFails(write(alice, ALICE, "e2", txn({ category: "y".repeat(61) }))));

await t("date must be a YYYY-MM-DD key", () => assertFails(write(alice, ALICE, "e2", txn({ date: "30/09/2026" }))));
await t("date CANNOT be a timestamp object", () => assertFails(write(alice, ALICE, "e2", txn({ date: { seconds: 1 } }))));

// Deliberately permissive: an old record carries fields these rules never
// knew about, and refusing them would lock someone out of their own row.
await t("an unknown extra field is still allowed", () =>
  assertSucceeds(write(alice, ALICE, "e5", txn({ note: "written by an older build" }))));

// A partial update is validated on the merged document, not the patch.
await t("an update that keeps the shape valid is allowed", () =>
  assertSucceeds(setDoc(doc(alice,"users",ALICE,"expenses","e1"), { title: "Groceries, again" }, { merge: true })));
await t("an update that breaks the shape is refused", () =>
  assertFails(setDoc(doc(alice,"users",ALICE,"expenses","e1"), { amountMinor: -1 }, { merge: true })));

await t("deleting does not require a valid body", () => assertSucceeds(deleteDoc(doc(alice,"users",ALICE,"expenses","e1"))));

// A record from before minor units: a float `amount` and nothing else. These
// two cases are why the client writes every validated field on an edit
// rather than the patch alone.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(),"users",ALICE,"expenses","legacy"), {
    id: "legacy", title: "Old rent", amount: 1350, type: "expense", category: "Housing", date: "2026-08-01",
  });
});
await t("a title-only patch on a legacy record is refused", () =>
  assertFails(setDoc(doc(alice,"users",ALICE,"expenses","legacy"), { title: "Rent" }, { merge: true })));
await t("the full record an edit now writes brings it up to date", () =>
  assertSucceeds(setDoc(doc(alice,"users",ALICE,"expenses","legacy"), {
    title: "Rent", type: "expense", category: "Housing", date: "2026-08-01",
    amountMinor: 135000, amount: 1350, currency: "INR",
  }, { merge: true })));
await t("a legacy record can still be deleted", () => assertSucceeds(deleteDoc(doc(alice,"users",ALICE,"expenses","legacy"))));

console.log("\n=== tasks, plans and habits are bounded ===");
const task = (patch = {}) => ({ title: "Ship it", status: "todo", completed: false, priority: "high", dueDate: "2026-10-13", dueTime: "09:30", leadMinutes: 30, repeat: { kind: "weekly", days: [1, 3] }, seriesId: "s1", createdAt: new Date(), ...patch });
const tdoc = (id) => doc(alice, "users", ALICE, "tasks", id);
await t("a task as the app writes it is accepted", () => assertSucceeds(setDoc(tdoc("tv1"), task())));
await t("a task title over 500 characters is refused", () => assertFails(setDoc(tdoc("tv2"), task({ title: "x".repeat(501) }))));
await t("a task title as a number is refused", () => assertFails(setDoc(tdoc("tv3"), task({ title: 42 }))));
await t("'completed' must be true or false", () => assertFails(setDoc(tdoc("tv4"), task({ completed: "yes" }))));
await t("a dueDate longer than a date key is refused", () => assertFails(setDoc(tdoc("tv5"), task({ dueDate: "x".repeat(50) }))));
await t("a cleared due date (empty string) is fine", () => assertSucceeds(setDoc(tdoc("tv6"), task({ dueDate: "" }))));
await t("a task with 41 fields is refused", () => {
  const big = task(); for (let i = 0; i < 35; i += 1) big[`f${i}`] = i;
  return assertFails(setDoc(tdoc("tv7"), big));
});
await t("status change on a valid task is accepted", () => assertSucceeds(setDoc(tdoc("tv1"), { status: "done", completed: true }, { merge: true })));

await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "users", ALICE, "habits", "legacyH"), { type: "daily", completedDays: {} });
});
await t("an old-format habit with no title can still be ticked", () =>
  assertSucceeds(setDoc(doc(alice, "users", ALICE, "habits", "legacyH"), { logs: { "2026-10-13": true } }, { merge: true })));
await t("a habit log over 4000 days is refused", () => {
  const logs = {}; for (let i = 0; i < 4001; i += 1) logs[`d${i}`] = true;
  return assertFails(setDoc(doc(alice, "users", ALICE, "habits", "hv1"), { title: "run", frequency: "daily", logs }));
});
await t("a habit title over 500 characters is refused", () => assertFails(setDoc(doc(alice, "users", ALICE, "habits", "hv2"), { title: "x".repeat(501), logs: {} })));

await t("a plan as the app writes it is accepted", () => assertSucceeds(setDoc(doc(alice, "users", ALICE, "planner", "pv1"), { title: "Deep work", date: "2026-10-13", priority: "high", completed: false, order: 0 })));
await t("a plan 'order' as text is refused", () => assertFails(setDoc(doc(alice, "users", ALICE, "planner", "pv2"), { title: "x", date: "2026-10-13", order: "first" })));
await t("a stranger still cannot write someone's plans", () => assertFails(setDoc(doc(mallory, "users", ALICE, "planner", "pv3"), { title: "x" })));

console.log("\n=== the workspace is four named collections, not a wildcard ===");
await t("owner still writes tasks", () => assertSucceeds(setDoc(doc(alice,"users",ALICE,"tasks","t1"),{title:"ship it"})));
await t("owner still writes planner entries", () => assertSucceeds(setDoc(doc(alice,"users",ALICE,"planner","p1"),{date:"2026-09-30"})));
await t("owner still writes habits", () => assertSucceeds(setDoc(doc(alice,"users",ALICE,"habits","h2"),{title:"read"})));
await t("a collection nobody declared is refused", () =>
  assertFails(setDoc(doc(alice,"users",ALICE,"secrets","s1"),{anything:true})));
await t("stranger CANNOT write someone's tasks", () => assertFails(setDoc(doc(mallory,"users",ALICE,"tasks","t2"),{title:"x"})));

console.log("\n=== focus timer: daily records and 'studying now' ===");
const fday = (id) => doc(alice, "users", ALICE, "focus", id);
const day = (patch = {}) => ({ date: "2026-10-21", minutes: 25, sessions: 1, subjects: { Physics: 25 }, updatedAt: new Date(), ...patch });
await t("owner records a focus day", () => assertSucceeds(setDoc(fday("2026-10-21"), day())));
await t("a later session adds to it", () => assertSucceeds(setDoc(fday("2026-10-21"), { minutes: increment(50), sessions: increment(1), date: "2026-10-21" }, { merge: true })));
await t("the record's date must match its id", () => assertFails(setDoc(fday("2026-10-22"), day())));
await t("an id that isn't a date is refused", () => assertFails(setDoc(fday("hello"), day({ date: "hello" }))));
await t("more than a day's minutes is refused", () => assertFails(setDoc(fday("2026-10-20"), day({ date: "2026-10-20", minutes: 2000 }))));
await t("fractional minutes are refused", () => assertFails(setDoc(fday("2026-10-20"), day({ date: "2026-10-20", minutes: 2.5 }))));
await t("extra fields are refused", () => assertFails(setDoc(fday("2026-10-20"), day({ date: "2026-10-20", note: "x" }))));
await t("a stranger cannot read someone's focus days", () => assertFails(getDoc(doc(mallory, "users", ALICE, "focus", "2026-10-21"))));
await t("a stranger cannot write someone's focus days", () => assertFails(setDoc(doc(mallory, "users", ALICE, "focus", "2026-10-21"), day())));
await t("owner publishes 'studying now' for friends", () => assertSucceeds(setDoc(doc(alice, "profiles", ALICE, "shared", "focus"), { focusing: true, endsAt: Date.now() + 60000 })));
await t("a stranger cannot see who is studying", () => assertFails(getDoc(doc(mallory, "profiles", ALICE, "shared", "focus"))));
await t("a stranger cannot fake someone's 'studying now'", () => assertFails(setDoc(doc(mallory, "profiles", ALICE, "shared", "focus"), { focusing: true })));

console.log("\n=== daily summary email settings ===");
const eprefs = (as, uid) => doc(as, "emailPrefs", uid);
await t("owner turns the summary on", () => assertSucceeds(setDoc(eprefs(alice, ALICE), { uid: ALICE, daily: true, time: "07:30", timeZone: "Asia/Kolkata", updatedAt: new Date() })));
await t("a badly formed time is refused", () => assertFails(setDoc(eprefs(alice, ALICE), { uid: ALICE, daily: true, time: "7am" })));
await t("extra fields are refused", () => assertFails(setDoc(eprefs(alice, ALICE), { uid: ALICE, daily: true, email: "someone@else.com" })));
await t("a stranger cannot read someone's email settings", () => assertFails(getDoc(eprefs(mallory, ALICE))));
await t("a stranger cannot sign someone up for emails", () => assertFails(setDoc(eprefs(mallory, ALICE), { uid: ALICE, daily: true })));

console.log("\n=== exam countdowns ===");
const exam = (patch = {}) => ({ title: "Physics final", date: "2026-11-12", subject: "Physics", createdAt: new Date(), ...patch });
await t("owner adds an exam", () => assertSucceeds(setDoc(doc(alice, "users", ALICE, "exams", "e1"), exam())));
await t("an exam needs a real date", () => assertFails(setDoc(doc(alice, "users", ALICE, "exams", "e2"), exam({ date: "next week" }))));
await t("an exam needs a title", () => assertFails(setDoc(doc(alice, "users", ALICE, "exams", "e3"), exam({ title: "" }))));
await t("extra fields are refused", () => assertFails(setDoc(doc(alice, "users", ALICE, "exams", "e4"), exam({ grade: "A" }))));
await t("a stranger cannot read someone's exams", () => assertFails(getDoc(doc(mallory, "users", ALICE, "exams", "e1"))));

console.log("\n=== achievements ===");
await t("owner records earned badges", () => assertSucceeds(setDoc(doc(alice, "profiles", ALICE, "shared", "badges"), { badges: { "focus-first": "2026-10-21" } }, { merge: true })));
await t("a stranger cannot see someone's badges", () => assertFails(getDoc(doc(mallory, "profiles", ALICE, "shared", "badges"))));
await t("a stranger cannot award someone badges", () => assertFails(setDoc(doc(mallory, "profiles", ALICE, "shared", "badges"), { badges: { "tasks-500": "2026-10-21" } })));

console.log("\n=== group study rooms ===");
// Bob lists Alice as a friend, so Alice may invite Bob. Mallory is nobody's friend.
await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "profiles", BOB, "friends", ALICE), { uid: ALICE }));
await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), "profiles", MALLORY, "friends", ALICE)));
const room = (patch = {}) => ({ host: ALICE, hostName: "Alice", invited: [], state: "idle", endsAt: null, left: null, minutes: 25, createdAt: new Date(), updatedAt: new Date(), ...patch });
const invite = (patch = {}) => ({ host: ALICE, hostName: "Alice", createdAt: new Date(), ...patch });
const member = (uid, patch = {}) => ({ uid, name: "Someone", joinedAt: new Date(), ...patch });
await t("host opens a room", () => assertSucceeds(setDoc(doc(alice, "rooms", "r1"), room())));
await t("nobody can open a room as someone else", () => assertFails(setDoc(doc(mallory, "rooms", "r2"), room())));
await t("a room cannot carry extra fields", () => assertFails(setDoc(doc(alice, "rooms", "r3"), room({ subject: "Physics" }))));
await t("a room's length is capped", () => assertFails(setDoc(doc(alice, "rooms", "r3"), room({ minutes: 600 }))));
await t("host joins their own room", () => assertSucceeds(setDoc(doc(alice, "rooms", "r1", "members", ALICE), member(ALICE))));
await t("host invites a friend", () => assertSucceeds(setDoc(doc(alice, "profiles", BOB, "studyInvites", "r1"), invite())));
await t("host cannot invite a stranger", () => assertFails(setDoc(doc(alice, "profiles", MALLORY, "studyInvites", "r1"), invite())));
await t("nobody can invite on the host's behalf", () => assertFails(setDoc(doc(mallory, "profiles", BOB, "studyInvites", "r1"), invite({ host: MALLORY }))));
await t("an invite must point at a room you host", () => assertFails(setDoc(doc(alice, "profiles", BOB, "studyInvites", "nope"), invite())));
await t("the invitee reads the room", () => assertSucceeds(getDoc(doc(bob, "rooms", "r1"))));
await t("a stranger cannot read the room", () => assertFails(getDoc(doc(mallory, "rooms", "r1"))));
await t("the invitee joins", () => assertSucceeds(setDoc(doc(bob, "rooms", "r1", "members", BOB), member(BOB))));
await t("the invitee sees who is in", () => assertSucceeds(getDocs(collection(bob, "rooms", "r1", "members"))));
await t("a stranger cannot join", () => assertFails(setDoc(doc(mallory, "rooms", "r1", "members", MALLORY), member(MALLORY))));
await t("a stranger cannot see who is in", () => assertFails(getDocs(collection(mallory, "rooms", "r1", "members"))));
await t("nobody can add someone else as a member", () => assertFails(setDoc(doc(bob, "rooms", "r1", "members", MALLORY), member(MALLORY))));
await t("host starts the timer", () => assertSucceeds(updateDoc(doc(alice, "rooms", "r1"), { state: "focus", endsAt: Date.now() + 1500000, invited: [BOB] })));
await t("a member cannot run the timer", () => assertFails(updateDoc(doc(bob, "rooms", "r1"), { state: "paused" })));
await t("a member cannot close the room", () => assertFails(deleteDoc(doc(bob, "rooms", "r1"))));
await t("a member leaves", () => assertSucceeds(deleteDoc(doc(bob, "rooms", "r1", "members", BOB))));
await t("the invitee declines", () => assertSucceeds(deleteDoc(doc(bob, "profiles", BOB, "studyInvites", "r1"))));
await t("after declining, the room is hidden again", () => assertFails(getDoc(doc(bob, "rooms", "r1"))));
await t("host invites again", () => assertSucceeds(setDoc(doc(alice, "profiles", BOB, "studyInvites", "r1"), invite())));
await t("host withdraws the invite", () => assertSucceeds(deleteDoc(doc(alice, "profiles", BOB, "studyInvites", "r1"))));
await t("host clears members and closes", () => assertSucceeds(deleteDoc(doc(alice, "rooms", "r1", "members", ALICE)).then(() => deleteDoc(doc(alice, "rooms", "r1")))));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
