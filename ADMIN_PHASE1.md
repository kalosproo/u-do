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

**1. Deploy rules, indexes and Functions**

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

The indexes are not optional. Three queries pair an equality filter with a
range or an order on a different field, which Firestore will not serve without
a composite index: failed payments in the last 24h, and a user's subscriptions
and payments by date. `firestore.indexes.json` defines them.

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

Firestore rules **have** now been executed against the emulator — 69 cases, all
passing, including the admin ones this section previously listed as outstanding:

```bash
npm i --no-save @firebase/rules-unit-testing firebase-tools
npx firebase emulators:exec --only firestore --project u-do-rules-test \
  "node firestore.rules.test.mjs"
```

What the admin cases establish: a non-admin cannot read someone else's
`billing`; an admin **cannot** read `users/{uid}/habits` or a person's shared
summary; no client, admin included, can write `adminAuditLogs`; and nobody can
promote themselves in `billing` or reset their own `usageCounters`. The split
described above is therefore enforced, not merely intended.

## The fix pass

Five things were wrong with Phase 1 as merged. Each is described by what broke
rather than by what changed, because the reasoning is the part worth keeping.

**Sign-in could not complete.** `signInWithRedirect` returns the credential
through the Firebase `authDomain` — `u-do-0.firebaseapp.com` — which is a
different site from wherever this console is deployed. Browsers that partition
third-party storage drop that handoff, so `getRedirectResult` resolved to null
and the app returned to the sign-in screen with nothing to show for the round
trip, and no error. It is now `signInWithPopup`, which keeps the credential in a
window this origin opened — the same call the consumer app has always used
against the same project. Redirect is kept as a fallback for the one case a
popup cannot serve: `auth/popup-blocked` or a webview with no popup support.
Closing the popup is treated as a decision, not a failure, so it raises no
error. `auth/unauthorized-domain` now names the host and the Console page that
fixes it, because that is the error a fresh deployment actually hits.

**One failed query took down all nine figures.** `getAdminOverview` computed
every figure inside a single `Promise.all`, so a collection without an index —
or one that does not exist yet — rejected the whole call and the console read
"Not loaded" across the board. Each figure is now attempted on its own and
carries its own `supported`/`unsupported` verdict, which is what that shape was
built for. A missing index reports the deploy command rather than the raw
error.

**Three queries had no index.** There was no `firestore.indexes.json` at all,
and `firebase.json` did not reference one, so `firebase deploy --only firestore`
shipped rules and nothing else. Four composite indexes are now defined — the
three above plus the Activity screen's type filter.

**A missing env var rendered a white page.** This is a separate Vercel project
from the consumer app, so it needs its own copy of all six `VITE_FIREBASE_*`
values, and `initializeApp` with an undefined `apiKey` throws while the module
is still evaluating — before React mounts. The config is now checked first, the
app is left uninitialised when it is incomplete, and the screen names the
variables that are missing and where to set them.

**The console looked like a different product.** It was light-only and carried
three actual colours — brass, oxblood, moss — against a consumer app that is
strictly monochrome with a dark default. `admin/src/styles/tokens.css` now
mirrors the consumer ramp exactly, dark is the default with a remembered light
toggle, and status is carried by tone and shape: the connection dot goes from
filled to hollow rather than from green to red, which also survives a reader who
cannot tell those two apart. The ramp is a deliberate copy rather than an
import, because `admin/` has to build from `admin/` alone for Vercel's Root
Directory to work — if the consumer ramp changes, change this one with it.

**Also landed:** Users (paged list, search by email or UID, detail) and Activity
(live feed, grouped by day, filterable by type) — the callables already existed,
so these were front-end only. `VITE_USE_EMULATORS` now does something; it was
documented in `.env.example` and honoured nowhere.

## Checks run on the fix pass

43 assertions against the real components in Chromium, with only the Firebase
SDK stubbed, covering: popup is used and redirect is not; a blocked popup falls
back; a dismissed popup raises nothing; an off-list account is signed out; a
missing claim hits the denied gate; nine figures render; a partly-failed
overview shows seven numbers and two reasons; the user list, search and detail;
the activity feed and its filter; the theme toggle persisting across a reload;
zero hue in either theme across three screens; and no horizontal overflow at
390px.

## Not done, by phase

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
