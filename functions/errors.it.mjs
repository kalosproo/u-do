// Error reporting against the Firestore emulator:  npm run test:functions
import { db } from "./src/firebaseAdmin.js";
import { Timestamp } from "firebase-admin/firestore";
import { logServerError, pruneErrorLogs, reportClientError } from "./src/errors/report.js";
const out = []; const check = (n, ok, d = "") => out.push({ n, ok: !!ok, d });
const logs = async () => (await db.collection("errorLogs").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const report = (uid, data) => reportClientError.run({ auth: uid ? { uid } : null, data, rawRequest: {} });

let threw = false;
try { await report(null, { message: "x" }); } catch (e) { threw = e.code === "unauthenticated"; }
check("1. signed-out reports are refused", threw);

const crash = { message: "Cannot read properties of undefined (reading 'amount') for a@b.co", stack: "TypeError\n    at Row (Finance.jsx:212:14)", source: "render", route: "/finance?x=1", userAgent: "UA" };
await report("u1", crash); await report("u2", crash); await report("u3", crash);
let l = await logs();
check("2. the same crash from three people is one row", l.length === 1, JSON.stringify(l.map((x) => x.id)));
check("3. ...counting three", l[0]?.count === 3, l[0]?.count);
check("4. stored without the email, query string or any uid", !JSON.stringify(l[0]).includes("a@b.co") && l[0].route === "/finance" && !("uid" in l[0]), JSON.stringify(l[0]));
check("5. shaped for the admin panel: message, severity, createdAt", l[0].message && l[0].severity === "error" && l[0].createdAt);

let limited = 0;
for (let i = 0; i < 25; i += 1) { const r = await report("spammer", { message: `junk ${i}` }); if (r.limited) limited += 1; }
check("6. one account is capped at 20 reports an hour", limited === 5, `limited ${limited}`);

await logServerError("onUserCreated", new Error("boom for 1234567890"));
l = await logs();
const server = l.find((x) => x.source === "server:onUserCreated");
check("7. server failures land as critical", server?.severity === "critical", JSON.stringify(server));
check("8. ...scrubbed the same way", server && !server.message.includes("1234567890"));

await db.collection("errorLogs").doc("old_2020-01-01").set({ message: "old", severity: "error", createdAt: Timestamp.fromMillis(Date.now() - 40 * 86400000) });
await pruneErrorLogs.run({});
l = await logs();
check("9. reports older than 30 days are pruned", !l.some((x) => x.id === "old_2020-01-01"));
check("10. ...and recent ones are kept", l.some((x) => x.source === "server:onUserCreated"));

for (const r of out) console.log(`${r.ok ? "  PASS" : "  FAIL"}  ${r.n}${!r.ok && r.d ? "\n        " + r.d : ""}`);
console.log(`\n${out.filter((r) => r.ok).length} passed, ${out.filter((r) => !r.ok).length} failed`);
process.exit(out.every((r) => r.ok) ? 0 : 1);
