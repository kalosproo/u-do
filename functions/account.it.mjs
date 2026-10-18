// Account security against the Auth + Firestore emulators:  npm run test:functions
import { getAuth } from "firebase-admin/auth";
import "./src/firebaseAdmin.js";
import { signOutEverywhere } from "./src/account/security.js";
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

for (const r of out) console.log(`${r.ok ? "  PASS" : "  FAIL"}  ${r.n}${!r.ok && r.d ? "\n        " + r.d : ""}`);
console.log(`\n${out.filter((r) => r.ok).length} passed, ${out.filter((r) => !r.ok).length} failed`);
process.exit(out.every((r) => r.ok) ? 0 : 1);
