import Link from "next/link";

// Branded not-found page: rendered for unmatched URLs and wherever
// notFound() is thrown. Without this file, users get Next's unbranded
// default. (Status-code caveat under PPR: see README §5.)
export default function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p>That page doesn&apos;t exist.</p>
      <Link href="/products">Browse products</Link>
    </>
  );
}
