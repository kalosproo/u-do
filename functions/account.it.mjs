// Account security against the Auth + Firestore emulators:  npm run test:functions
process.env.EMAIL_LINK_SECRET = "test-link-secret-0123456789";
import { getAuth } from "firebase-admin/auth";
import "./src/firebaseAdmin.js";
import { signOutEverywhere } from "./src/account/security.js";
import { sendTestPush } from "./src/notifications/test.js";
import { db } from "./src/firebaseAdmin.js";
import { emailUnsubscribe } from "./src/email/email.js";
import { unsubscribeSignature } from "./src/email/emailCore.js";
import { deleteMyAccount } from "./src/account/delete.js";
import { onStudyInvite } from "./src/notifications/friends.js";
import { gatherExams } from "./src/notifications/digest.js";
import { composeExamNudge } from "./src/notifications/examNudge.js";
const out = []; const check = (n, ok, d = "") => out.push({ n, ok: !!ok, d });

let code = null;
try { await signOutEverywhere.run({ auth: null, data: {}, rawRequest: {} }); } catch (e) { code = e.code; }
check("1. signed out, nothing can be revoked", code === "unauthenticated", code);

const user = await getAuth().createUser({ email: "sec@example.com", password: "secret123" });
const before = (await getAuth().getUser(user.uid)).tokensValidAfterTime;
await new Promise((r) => setTimeout(r, 1100));
const result = await signOutEverywhere.run({ auth: { uid: user.uid, token: {} }, data: {}, rawRequest: {} });
const after = (await getAuth().getUser(user.uid)).tokensValidAfterTime;
check("2. sign out everywhere revokes every session of that account", result.ok && new Date(after) > new Date(before), `${before} -> ${after}`);

const other = await getAuth().createUser({ email: "other@example.com", password: "secret123" });
const otherBefore = (await getAuth().getUser(other.uid)).tokensValidAfterTime;
check("3. ...and nobody else's", (await getAuth().getUser(other.uid)).tokensValidAfterTime === otherBefore);

const test = (uid) => sendTestPush.run({ auth: uid ? { uid, token: {} } : null, data: {}, rawRequest: {} });
code = null;
try { await test(null); } catch (e) { code = e.code; }
check("4. a test push needs a signed-in account", code === "unauthenticated", code);
let res = await test("nobody");
check("5. no subscription: reports zero devices instead of failing", res.devices === 0 && res.sent === 0, JSON.stringify(res));
await db.collection("pushSubscriptions").doc("pt1").set({ uid: "pt1", enabled: true, tokens: {} });
res = await test("pt1");
check("6. a subscription with no devices says so", res.devices === 0 && res.sent === 0, JSON.stringify(res));
code = null;
try { await test("pt1"); } catch (e) { code = e.code; }
check("7. a second test within 30 seconds is refused", code === "resource-exhausted", code);

const hit = (query) => new Promise((resolve) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, send(b) { resolve({ status: this.statusCode, body: b }); }, set() { return this; }, setHeader() {}, getHeader() {} };
  emailUnsubscribe({ method: "GET", query, headers: {}, get: () => undefined, header: () => undefined }, res);
});
await db.collection("emailPrefs").doc("em1").set({ uid: "em1", daily: true, monthly: true, time: "07:30" });
let page = await hit({ u: "em1", s: "forged" });
check("8. a forged unsubscribe link changes nothing", page.status === 400 && (await db.collection("emailPrefs").doc("em1").get()).data().daily === true, page.status);
page = await hit({ u: "em1", s: unsubscribeSignature("em1", process.env.EMAIL_LINK_SECRET) });
const prefsAfter = (await db.collection("emailPrefs").doc("em1").get()).data();
check("9. the signed link turns every email off without signing in", page.status === 200 && prefsAfter.daily === false && prefsAfter.monthly === false, page.status);

// Deleting an account closes the rooms it hosts and leaves anyone else's.
const host = await getAuth().createUser({ email: "host@example.com" });
await db.collection("rooms").doc("room1").set({ host: host.uid, hostName: "Host", invited: ["friend1"], state: "idle", minutes: 25 });
await db.collection("rooms").doc("room1").collection("members").doc(host.uid).set({ uid: host.uid, name: "Host" });
await db.collection("profiles").doc("friend1").collection("studyInvites").doc("room1").set({ host: host.uid, hostName: "Host" });
await db.collection("rooms").doc("room2").set({ host: "someoneElse", hostName: "Else", invited: [host.uid], state: "idle", minutes: 25 });
await db.collection("rooms").doc("room2").collection("members").doc(host.uid).set({ uid: host.uid, name: "Host" });
await db.collection("profiles").doc(host.uid).collection("studyInvites").doc("room2").set({ host: "someoneElse", hostName: "Else" });
await deleteMyAccount.run({ auth: { uid: host.uid, token: { auth_time: Math.floor(Date.now() / 1000) } }, data: {}, rawRequest: {} });
check("10. deleting an account closes the rooms it hosts",
  !(await db.collection("rooms").doc("room1").get()).exists
  && !(await db.collection("profiles").doc("friend1").collection("studyInvites").doc("room1").get()).exists
  && (await db.collection("rooms").doc("room1").collection("members").get()).empty);
check("11. ...and leaves other people's rooms, invites included",
  (await db.collection("rooms").doc("room2").get()).exists
  && !(await db.collection("rooms").doc("room2").collection("members").doc(host.uid).get()).exists
  && !(await db.collection("profiles").doc(host.uid).collection("studyInvites").doc("room2").get()).exists);

// A study room invite: no push set up means nothing is sent and nothing fails;
// a device-less subscription is reached without error.
const invite = (uid, host) => onStudyInvite.run({ params: { uid, roomId: "r9" }, data: { data: () => ({ host }) } });
let threw = null;
try { await invite("nopush", "hostA"); } catch (e) { threw = e; }
check("12. a study invite to someone without push is a quiet no-op", threw === null, threw?.message);
await db.collection("pushSubscriptions").doc("withpush").set({ uid: "withpush", enabled: true, tokens: {} });
threw = null;
try { await invite("withpush", "hostA"); } catch (e) { threw = e; }
check("13. a study invite reaches the push sender without error", threw === null, threw?.message);

// The exam nudge reads the coming week's exams and two weeks of focus.
const ws = db.collection("users").doc("exam1");
await ws.collection("exams").doc("a").set({ title: "Physics final", date: "2026-10-25", subject: "Physics" });
await ws.collection("exams").doc("b").set({ title: "Far away", date: "2026-12-01", subject: "Maths" });
await ws.collection("focus").doc("2026-10-20").set({ date: "2026-10-20", minutes: 50, subjects: { Physics: 50 } });
await ws.collection("focus").doc("2026-09-01").set({ date: "2026-09-01", minutes: 90, subjects: { Physics: 90 } });
const nudge = composeExamNudge(await gatherExams("exam1", "2026-10-22"));
check("14. the exam nudge names the exam and only recent study time",
  nudge?.title === "Physics final is in 3 days" && nudge?.body === "50m on Physics in the last two weeks.", JSON.stringify(nudge));

for (const r of out) console.log(`${r.ok ? "  PASS" : "  FAIL"}  ${r.n}${!r.ok && r.d ? "\n        " + r.d : ""}`);
console.log(`\n${out.filter((r) => r.ok).length} passed, ${out.filter((r) => !r.ok).length} failed`);
process.exit(out.every((r) => r.ok) ? 0 : 1);
