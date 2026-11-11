import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    css: false,
    testTimeout: 10000,
    // The Playwright e2e specs are a separate runner (npx playwright test), not Vitest.
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
