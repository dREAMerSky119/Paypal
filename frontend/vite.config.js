import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    testTimeout: 10000,
    // Large lazily loaded analytics pages can take longer than Testing Library's default query window.
    // Keep default async queries patient enough for the first module load.
    css: false,
  },
});
