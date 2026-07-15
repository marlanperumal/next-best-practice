import { defineConfig, devices } from "@playwright/test";

// Two production instances sharing one build, one file-backed cache handler,
// and one external service (instance A hosts the simulated API; B points at
// it) — the minimal model of a multi-instance deployment. Runs only
// e2e/multi-instance.spec.ts via `pnpm e2e:multi`.
const PORT_A = 3002;
const PORT_B = 3003;

const sharedEnv = {
  CACHE_HANDLER: "file",
  EXTERNAL_API_URL: `http://localhost:${PORT_A}/api`,
  SERVICE_LATENCY_MS: "50",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/multi-instance.spec.ts",
  workers: 1,
  use: { baseURL: `http://localhost:${PORT_A}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `rm -rf .cache-handler && pnpm build && pnpm start --port ${PORT_A}`,
      url: `http://localhost:${PORT_A}`,
      env: sharedEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Same build, second instance: wait until A is serving (build done).
      command: `sh -c 'until curl -sf http://localhost:${PORT_A} > /dev/null; do sleep 1; done; pnpm start --port ${PORT_B}'`,
      url: `http://localhost:${PORT_B}`,
      env: sharedEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
