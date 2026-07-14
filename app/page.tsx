import Link from "next/link";

// No dynamic data: this page is fully prerendered at build time.
export default function HomePage() {
  return (
    <>
      <h1>Next Best Practice</h1>
      <p>
        A minimal catalog app demonstrating App Router patterns: server and
        client components, caching, URL state with nuqs, and zustand stores.
      </p>
      <Link href="/products">Browse products</Link>
    </>
  );
}
