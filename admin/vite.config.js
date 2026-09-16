import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Self-contained: this app builds from admin/ alone, so the consumer app's
// root files are never touched and Vercel can point its Root Directory here.
export default defineConfig({
  plugins: [react()],
});
