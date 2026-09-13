# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Change the U.Do logo

The app logo is loaded from a single file:

- `src/assets/udo-logo.svg`

To use a different logo **without changing code**:

1. Keep the file name `udo-logo.svg`.
2. Replace the file contents with your new SVG (or export your design as SVG and overwrite this file).
3. Run `npm run dev` and refresh.

If you want to use PNG/JPG instead:

1. Add the image to `src/assets/` (for example `udo-logo.png`).
2. Update the import path in `src/components/BrandLogo.jsx`.
3. Adjust size in `src/index.css` (`.brand-mark` and `.brand-compact .brand-mark`).

## Branding and login

- U.Do logo used in app UI and favicon.
- Login subtitle centered in the auth card.
- Sign-up and login accept any valid email address, via email/password or
  Google. There is no domain restriction: an earlier note here claimed logins
  were limited to `@svce.edu.in`, but nothing in the app ever enforced that.

A Cloud Function in `functions/` (`authorizeAuthAttempt`) was written to enforce
a domain allowlist and rate-limit auth attempts. No page has ever called it, and
its allowlist is empty, so it has no effect. The unused client-side half was
removed; the function itself is left in place for whoever wants to finish wiring
it up.


## AI setup (free — Groq)

The U.Do Assistant and Quick Capture both run on [Groq](https://console.groq.com/keys), which gives a free API key with no credit card required.

1. Sign up at console.groq.com and create an API key.
2. Create or edit `.env.local`.
3. Add `VITE_GROQ_API_KEY` with your real key.
4. (Optional) Set `VITE_GROQ_MODEL` to override the default model (`llama-3.3-70b-versatile`).
5. Restart the dev server.

```bash
cp .env.example .env.local
echo "VITE_GROQ_API_KEY=your_key_here" >> .env.local
npm run dev
```

> Keep `.env.local` out of git. Commit only `.env.example`.
> Free tier limits (per Groq, subject to change): ~30 requests/minute, ~14,400 requests/day. Plenty for personal use. All Groq calls retry automatically with backoff on rate-limit (429) or transient server errors.

### Quick Capture

Tap the ⚡ button (bottom-right, on every page) and type a line like:

- `spent 20rs on juice` → logged to Finance as an expense
- `got 500 from freelance` → logged to Finance as income
- `submit assignment tomorrow` → added to Tasks
- `meditate daily` → added to Habits

It shows a 1-tap confirm card (editable) before saving anything — nothing is written until you confirm.

### AI Auto-Plan Week (Planner page)

Click **"AI Auto-Plan Week"** at the top of the Planner. It reads your pending Tasks and whatever's already on this week's planner, then proposes which day to schedule each task on (respecting due dates and a max of 4 items/day, without duplicating anything already scheduled). Review the proposed list, drop anything you don't want, then confirm to add the rest.

## Friends (streaks + habit progress)

Friends can see **your habit names, current streaks and completion rates** — and
nothing else. Tasks, planner entries, finance and the raw day-by-day habit logs
are never readable by another account.

That boundary is structural, not cosmetic. Your workspace lives under
`users/{uid}/…` and stays owner-only. The Habits page separately publishes a
small summary card to `profiles/{uid}/shared/summary`, and only accounts on your
friend list can read it.

### Deploy the rules first

The feature will not work until `firestore.rules` is live — reads will fail with
`permission-denied`.

```bash
npx firebase deploy --only firestore:rules
```

> Heads up: this **replaces** whatever rules are currently in the Firebase
> console. `firestore.rules` covers everything the app uses today (tasks,
> planner, expenses, habits, the friends collections, and the `authRateLimits`
> collection the auth Cloud Function writes through the Admin SDK). If you have
> added anything else in the console, fold it in before deploying.

To re-check the rules after editing them:

```bash
npm i --no-save @firebase/rules-unit-testing firebase-tools
npx firebase emulators:exec --only firestore --project u-do-rules-test \
  "node firestore.rules.test.mjs"
```

That suite covers the cases worth being sure about: a stranger cannot read your
habits, a non-friend cannot read your summary, nobody can add themselves to your
friend list, and unfriending revokes access both ways. It needs a JDK for the
emulator.

### Using it

Open **Friends** in the sidebar and claim a username — that also generates your
invite code and link. There are three ways to add someone, all of which end in a
request they have to accept:

- **Username** — search `@theirname`.
- **Invite code** — an 8-character code, no ambiguous `I`/`O`/`0`/`1`.
- **Invite link** — `…/friends?add=CODE`, which opens the app with their profile
  already looked up.

Until they accept, neither side can see anything. Removing a friend clears both
sides of the friendship immediately.

Your shared card refreshes whenever you open the Habits page or tick a habit.
Accounts that never claim a username publish nothing at all.
