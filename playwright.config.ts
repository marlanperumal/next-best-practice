import { defineConfig, devices } from "@playwright/test";

// e2e runs a production build on its own port so it never collides with (or
// silently reuses) a dev server on :3000.
const PORT = 3001;

export default defineConfig({
  testDir: "./e2e",
  // Tests mutate shared state in the external service; run serially.
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { EXTERNAL_API_URL: `http://localhost:${PORT}/api` },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
