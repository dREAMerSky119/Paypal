import { defineConfig } from "@playwright/test";

// Phase B4 e2e: build a package, see the live quote, save it, open the itinerary
// studio from the saved package, and check the A4 print preview.
// Runs against the Vite dev server proxying to a local backend (see webServer entries).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
