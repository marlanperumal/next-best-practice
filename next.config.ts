import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Dev-only: log every server-side fetch with its full URL and cache
  // status — the quickest way to see cache HITs vs upstream requests.
  logging: { fetches: { fullUrl: true } },
  // Opt-in shared cache handler (see cache-handlers/file-handler.cjs). The
  // built-in default is an in-memory LRU — correct for one instance, but on
  // multi-instance deployments each instance has its own cache and tag
  // invalidations don't propagate; that's when 'use cache' needs a shared
  // handler (Redis in production; a shared directory here). Enabled by the
  // e2e config; plain `pnpm dev` keeps the in-memory default.
  ...(process.env.CACHE_HANDLER === "file" && {
    cacheHandlers: {
      default: path.join(process.cwd(), "cache-handlers/file-handler.cjs"),
    },
  }),
};

export default nextConfig;
