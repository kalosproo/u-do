// Usage triggers against the Firestore emulator:  npm run test:usage
// Runs the real handlers against the Firestore emulator. firebase-tools routes
// even local emulator traffic through this environment's proxy, so the
// Functions emulator cannot register triggers here; invoking each handler with
// the event it would receive exercises the same code, queries and transactions.
import { db } from "./src/firebaseAdmin.js";
import { onUserCreated, onWorkspaceWrite } from "./src/usage/track.js";
const snap = (v) => ({ exists: v != null, data: () => v });
let seq = 0;
const fire = async (uid, collection, docId, before, after) =>
  onWorkspaceWrite.run({ params: { uid, collection, docId }, data: { before: snap(before), after: snap(after) }, id: `e${++seq}` });
const stored = new Map();
const write = async (uid, c, id, after) => {
  const key = `${uid}/${c}/${id}`; const before = stored.get(key) ?? null;
  const ref = db.collection("users").doc(uid).collection(c).doc(id);
  if (after == null) { await ref.delete(); stored.delete(key); } else { await ref.set(after); stored.set(key, after); }
  await fire(uid, c, id, before, after);
};
const out = []; const check = (n, ok, d = "") => out.push({ n, ok: !!ok, d });
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 300)); } return null; };
const ws = (uid, c) => db.collection("users").doc(uid).collection(c);
const usage = async (uid) => (await db.collection("usageCounters").doc(uid).get()).data();
const events = async (uid) => (await db.collection("activityEvents").where("uid", "==", uid).get()).docs.map(d => d.data().type).sort();
const month = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);

const uid = "it_user_1";
await onUserCreated.run({ uid, email: "it@example.com", metadata: { creationTime: new Date().toUTCString() } }, {});
const billing = await until(async () => (await db.collection("billing").doc(uid).get()).data());
check("1. a new signup gets a billing record", billing?.planId === "free" && billing?.source === "signup", JSON.stringify(billing));
check("2. ...and a usage record", (await usage(uid))?.counters?.tasksActive === 0);
check("3. ...and a signup event", (await until(async () => (await events(uid)).includes("signup"))) !== null);

await write(uid, "tasks", "t1", { title: "a", status: "todo", completed: false });
await write(uid, "tasks", "t2", { title: "b", status: "todo", completed: false });
await write(uid, "expenses", "e1", { title: "Chai", amountMinor: 1250, date: `${month}-05` });
await write(uid, "expenses", "e2", { title: "Old", amountMinor: 999, date: "2020-01-01" });
await write(uid, "habits", "h1", { title: "run" });
const u1 = await until(async () => { const u = await usage(uid); return u?.counters?.tasksActive === 2 && u.counters.financeEntriesPerMonth === 1 && u.counters.habits === 1 ? u : null; });
check("4. counters follow writes: 2 active tasks, 1 habit", !!u1, JSON.stringify(await usage(uid)));
check("5. only this month's transactions count toward the monthly figure", u1?.counters?.financeEntriesPerMonth === 1);
check("6. the person is marked active", !!u1?.lastActiveAt);

await write(uid, "tasks", "t1", { title: "a", status: "done", completed: true });
const u2 = await until(async () => (await usage(uid))?.counters?.tasksActive === 1);
check("7. completing a task drops the active count", !!u2, JSON.stringify((await usage(uid))?.counters));
const ev = await until(async () => { const e = await events(uid); return e.includes("task_completed") ? e : null; });
check("8. events: signup, 2 tasks, 1 completion, 2 transactions, 1 habit", JSON.stringify(ev) === JSON.stringify(["habit_created","signup","task_completed","task_created","task_created","transaction_added","transaction_added"]), JSON.stringify(await events(uid)));
const sample = (await db.collection("activityEvents").where("uid", "==", uid).limit(1).get()).docs[0].data();
check("9. an event holds only type, uid and time — no content", JSON.stringify(Object.keys(sample).sort()) === '["createdAt","type","uid"]', JSON.stringify(Object.keys(sample)));

// The deletion race: billing gone, then the workspace deletes fire triggers.
await db.collection("billing").doc(uid).delete();
await db.collection("usageCounters").doc(uid).delete();
for (const [c, id] of [["tasks","t1"],["tasks","t2"],["expenses","e1"],["expenses","e2"],["habits","h1"]]) await write(uid, c, id, null);
check("10. deleting a workspace after billing is gone does NOT resurrect a usage record", !(await db.collection("usageCounters").doc(uid).get()).exists);

const before = (await events(uid)).length;
await write(uid, "tasks", "late", { title: "x", completed: false });
check("11. ...and no new events are logged for an account with no billing", (await events(uid)).length === before);

for (const r of out) console.log(`${r.ok ? "  PASS" : "  FAIL"}  ${r.n}${!r.ok && r.d ? "\n        " + r.d : ""}`);
console.log(`\n${out.filter(r => r.ok).length} passed, ${out.filter(r => !r.ok).length} failed`);
process.exit(out.every(r => r.ok) ? 0 : 1);
