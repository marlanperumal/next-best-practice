"use client";

// Error boundary for the products segment: keeps the rest of the app usable
// when a data fetch throws, and offers a retry.
export default function ProductsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div role="alert">
      <p>Something went wrong loading products: {error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
