import { defineConfig, devices } from "@playwright/test";

// Fast default suite: ONE production instance. The multi-instance
// shared-cache proof lives in playwright.multi.config.ts (`pnpm e2e:multi`);
// it uses different ports so the two configs can never silently reuse each
// other's servers. Dedicated ports also mean a dev server on :3000 is never
// collided with.
//
// This suite runs on the file cache handler (own directory) rather than the
// built-in in-memory one: Next's default handler inherits the clock-drift
// bug described in README §12 — under WSL2 this exact suite failed its last
// test once the server was ~a minute old, because invalidations stopped
// landing on recently written entries. The normalized handler is immune.
const PORT = 3001;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/multi-instance.spec.ts",
  // Tests mutate shared state in the external service; run serially.
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -rf .cache-handler-single && pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: {
      EXTERNAL_API_URL: `http://localhost:${PORT}/api`,
      CACHE_HANDLER: "file",
      CACHE_HANDLER_DIR: ".cache-handler-single",
      SERVICE_LATENCY_MS: "50",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
