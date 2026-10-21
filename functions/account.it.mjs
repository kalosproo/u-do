// Account security against the Auth + Firestore emulators:  npm run test:functions
process.env.EMAIL_LINK_SECRET = "test-link-secret-0123456789";
import { getAuth } from "firebase-admin/auth";
import "./src/firebaseAdmin.js";
import { signOutEverywhere } from "./src/account/security.js";
import { sendTestPush } from "./src/notifications/test.js";
import { db } from "./src/firebaseAdmin.js";
import { emailUnsubscribe } from "./src/email/email.js";
import { unsubscribeSignature } from "./src/email/emailCore.js";
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
await db.collection("emailPrefs").doc("em1").set({ uid: "em1", daily: true, time: "07:30" });
let page = await hit({ u: "em1", s: "forged" });
check("8. a forged unsubscribe link changes nothing", page.status === 400 && (await db.collection("emailPrefs").doc("em1").get()).data().daily === true, page.status);
page = await hit({ u: "em1", s: unsubscribeSignature("em1", process.env.EMAIL_LINK_SECRET) });
check("9. the signed link turns the summary off without signing in", page.status === 200 && (await db.collection("emailPrefs").doc("em1").get()).data().daily === false, page.status);

for (const r of out) console.log(`${r.ok ? "  PASS" : "  FAIL"}  ${r.n}${!r.ok && r.d ? "\n        " + r.d : ""}`);
console.log(`\n${out.filter((r) => r.ok).length} passed, ${out.filter((r) => !r.ok).length} failed`);
process.exit(out.every((r) => r.ok) ? 0 : 1);
