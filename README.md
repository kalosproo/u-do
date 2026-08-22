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

## Latest U.Do branding/auth update

This branch includes the refreshed U.Do app branding and login behavior:

- U.Do logo used in app UI and favicon.
- Login subtitle centered in the auth card.
- Email/password auth restricted to `@svce.edu.in` addresses.


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
