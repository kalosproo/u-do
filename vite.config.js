import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Firebase and React change far less often than the app does. In their own
// files they stay in the browser's cache across deploys, so a returning
// visitor downloads only the app code that actually changed.
const vendorChunk = (id) => {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'firebase'
  if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react'
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
})
