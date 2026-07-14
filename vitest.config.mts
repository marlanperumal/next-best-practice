import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Framework-boundary stubs: these modules only exist inside the Next.js
      // runtime. Everything else (fetch traffic) is mocked by MSW instead.
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
      "next/cache": fileURLToPath(new URL("./tests/stubs/next-cache.ts", import.meta.url)),
      "next/headers": fileURLToPath(new URL("./tests/stubs/next-headers.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    projects: [
      // Default: real modules end to end, network intercepted by MSW.
      {
        extends: true,
        test: { name: "unit", include: ["tests/*.test.tsx"] },
      },
      // Module seam: the "mock" condition swaps "#api/client" for the typed
      // mock (package.json "imports"). For boundaries MSW can't reach.
      {
        extends: true,
        resolve: { conditions: ["mock"] },
        test: { name: "seam", include: ["tests/seam/*.test.tsx"] },
      },
    ],
  },
});
