"use client";

// Last-resort boundary: catches errors thrown by the root layout itself,
// which segment error.tsx files can't reach. It replaces the entire page, so
// it must render its own <html> and <body>. Only active in production
// builds — dev shows the overlay instead.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <h1>Something went wrong</h1>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
