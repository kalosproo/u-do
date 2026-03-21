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


## OpenAI API setup

To run the U.Do Assistant, set your OpenAI API key in a local env file:

1. Create or edit `.env.local`.
2. Add `VITE_OPENAI_API_KEY` with your real key.
3. (Optional) Set `VITE_OPENAI_MODEL` to override the default model (`gpt-4o-mini`).
4. Restart the dev server.

```bash
cp .env.example .env.local
echo "VITE_OPENAI_API_KEY=your_key_here" >> .env.local
npm run dev
```

> Keep `.env.local` out of git. Commit only `.env.example`.
