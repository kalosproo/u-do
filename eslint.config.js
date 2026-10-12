import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `admin` is a separate project with its own eslint config and its own lint
  // script, which CI runs separately. Without it here, `eslint .` from the root
  // walks into admin/dist and reports thousands of errors in minified bundle
  // output — the root config's own 'dist' ignore does not reach a nested one.
  globalIgnores(['dist', 'admin', 'functions/node_modules']),

  // The push service worker is a classic worker, not a module and not a page:
  // it has importScripts and the service-worker globals, and no window. Its
  // globals are declared here because /* eslint-env */ comments are ignored
  // under flat config and become an error in ESLint 10.
  {
    files: ['public/firebase-messaging-sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, importScripts: 'readonly', firebase: 'readonly' },
    },
  },

  // Cloud Functions are Node ESM, not browser code.
  {
    files: ['functions/**/*.js', 'scripts/**/*.mjs', '*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
