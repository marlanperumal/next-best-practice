import type { NextConfig } from "next";

// Deliberately NO cacheComponents: this app runs the previous caching model
// (per-fetch Data Cache options, unstable_cache, segment configs, ISR).
const nextConfig: NextConfig = {};

export default nextConfig;
