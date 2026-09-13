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
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "u-do-rules-test",
  firestore: { rules: readFileSync(new URL("./firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});

const ALICE = "alice_uid", BOB = "bob_uid", MALLORY = "mallory_uid";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const mallory = env.authenticatedContext(MALLORY).firestore();
const anon = env.unauthenticatedContext().firestore();

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

console.log("\n=== rate limit collection is closed to clients ===");
await t("client CANNOT read authRateLimits", () => assertFails(getDoc(doc(alice,"authRateLimits","ip:1.2.3.4"))));
await t("client CANNOT write authRateLimits", () => assertFails(setDoc(doc(alice,"authRateLimits","ip:1.2.3.4"),{count:0})));
await t("unknown collections are closed", () => assertFails(setDoc(doc(alice,"randomStuff","x"),{a:1})));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
