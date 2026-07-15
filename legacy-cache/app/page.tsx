import Link from "next/link";

// Static page (previous model default: no dynamic APIs, no fetch = static).
export default function HomePage() {
  return (
    <>
      <h1>Legacy cache model</h1>
      <p>
        The same catalog, built on the pre-Cache-Components model: per-fetch
        Data Cache options, unstable_cache, segment configs, and ISR. Requires
        the main app running on :3000 (it hosts the external service). See
        the README for the pattern-by-pattern mapping.
      </p>
      <Link href="/products">Browse products</Link>
    </>
  );
}
