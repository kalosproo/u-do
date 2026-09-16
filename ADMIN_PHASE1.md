# U.Do admin console — Phase 1

A separate admin app at `admin/`, sharing the `u-do-0` Firebase project with the
consumer app but building and deploying on its own. Nothing in `src/` was moved
or restructured, so the live consumer deployment is unaffected by anything here.

## What landed

**New backend (shared Firebase project)**

| File | Does |
| --- | --- |
| `functions/src/firebaseAdmin.js` | Shared Admin SDK init. Exists because ESM evaluates imported modules before the importing module's body — without it, `getFirestore()` in the admin modules would run before `initializeApp()`. |
| `functions/src/schema/plans.js` | The one definition of plan limits, pricing and usage fields. |
| `functions/src/admin/guard.js` | `requireAdmin()` — claim + role check, request ID generation, page-size clamp. |
| `functions/src/admin/audit.js` | Append-only writer for `adminAuditLogs`. |
| `functions/src/admin/claims.js` | `setAdminClaim` (owner only), `getAdminIdentity`. |
| `functions/src/admin/overview.js` | `getAdminOverview` — every figure via `count()` aggregation. |
| `functions/src/admin/users.js` | `listAdminUsers`, `findAdminUser`, `getAdminUserDetail`. |
| `functions/src/admin/billing.js` | `seedPlanLimits`, `backfillBilling`. |
| `functions/src/index.js` | Existing `authorizeAuthAttempt` untouched; admin callables re-exported. |
| `firestore.rules` | Existing rules unchanged; `isAdmin()` and ten operational collections added. |
| `scripts/bootstrap-admin.mjs` | Grants the first owner claim locally via service account. |

**New admin app** — `admin/` (20 files): Vite config, env template, Vercel
config with `noindex` and `X-Frame-Options: DENY`, auth context, realtime hooks,
shell with all 13 sections, sign-in, Overview, and the placeholder for unbuilt
sections.

**Consumer app** — two additive files only, `src/hooks/usePlan.js` and
`src/components/PlanBadge.jsx`. No existing file was edited. The badge is
unmounted until you choose to place it.

## Setup, in order

**1. Deploy rules and Functions**

```bash
firebase deploy --only firestore:rules,functions
```

**2. Make yourself owner** (once, from your machine)

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
node scripts/bootstrap-admin.mjs you@example.com
```

Sign out of everything afterwards — the claim only appears in a fresh token.

**3. Run the admin app locally**

```bash
cd admin
cp .env.example .env.local     # fill in VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID
npm install
npm run dev                    # http://localhost:5174
```

**4. Seed plans and backfill billing**

Both are owner-only callables. Until `backfillBilling` runs, the Overview
reports zero users, because every count is derived from `billing` rather than
from Auth. From the browser console while signed in as owner:

```js
const { getFunctions, httpsCallable } = await import("firebase/functions");
const fns = getFunctions();
await httpsCallable(fns, "seedPlanLimits")();
await httpsCallable(fns, "backfillBilling")();
```

**5. Deploy the admin app**

New Vercel project, same repo, **Root Directory = `admin`**. Add the same env
vars. Point it at `u-do-admin.vercel.app`.

**6. Optional — show the plan badge**

```jsx
import PlanBadge from "../components/PlanBadge";
// inside Sidebar or Profile, wherever it fits:
<PlanBadge />
```

## Security model

Admin identity is a Firebase custom claim, `{ admin: true, adminRole }`, settable
only by the Admin SDK. No email allowlist, no client-side `isAdmin`.

The split between direct reads and Functions is deliberate:

- **Claim-gated Firestore reads** cover operational collections only — `billing`,
  `subscriptions`, `payments`, `usageCounters`, `activityEvents`, `errorLogs`,
  `webhookEvents`, `adminAuditLogs`, `stats`. These are what the console streams
  live, and `onSnapshot` cannot run through a Function.
- **Cloud Functions** cover everything touching a person's own content.
  `users/{uid}/**` stays owner-only in the rules, including for admins.
  `getAdminUserDetail` returns counts and status — 12 of 30 finance entries
  used, never what those entries were. Tasks, expenses, friend messages and AI
  prompts are not reachable from the admin app at all.

Every client write to the new collections is refused. The Admin SDK bypasses
rules, so the server remains the only writer. `adminAuditLogs` has no update or
delete path anywhere in the codebase.

## Checks run

- `npx eslint .` in `admin/` — clean, 0 errors, 0 warnings
- `npm run build` in `admin/` — succeeds, 659 modules
- `node --check` on all 10 Functions and script files — all parse as ESM
- esbuild parse on all 28 generated JS/JSX files — all pass

Three issues were found and fixed rather than suppressed: the ESM
initialisation-order bug above, a `setState`-inside-effect cascade in
`useLiveCollection`, and two fast-refresh boundary violations (`SECTIONS` and the
auth context now live in their own modules).

Firestore rules were **not** executed against the emulator here. Before relying
on them, run the existing suite plus new admin cases:

```bash
firebase emulators:exec --only firestore "node --test firestore.rules.test.mjs"
```

The cases worth adding: a non-admin reading `billing/{someoneElse}` is denied; an
admin reading `users/{uid}/tasks` is denied; any client write to `adminAuditLogs`
is denied.

## Not done, by phase

- **2** — Users list and detail screens, Activity feed. Callables already exist.
- **3** — Subscriptions, Payments, Revenue, Usage screens; Razorpay webhook
  handler writing `subscriptions`, `payments`, `webhookEvents`.
- **4** — Errors, Webhooks, Limits, Audit screens.
- **5** — Reports, and the controlled actions (disable, grant temporary Pro,
  reset a quota), each writing an audit entry.

Also outstanding and worth deciding early: quota counters are not yet enforced.
`usageCounters` exists and is server-write-only, but nothing increments it until
the consumer write paths route through Functions. Until then the Free limits in
`plans.js` are documentation, not enforcement.

Pro has no price. `planLimits/pro.priceMinor` is `null`, so MRR renders its
reason instead of a number. Set it in Firestore when you decide, and the figure
starts working with no code change.
