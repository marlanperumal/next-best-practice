// Skeleton fallbacks that mirror the shape of the content they stand in for
// — a page that keeps its layout while loading reads as faster than a
// spinner or a text swap. Server components: no interactivity needed.

export function ProductListSkeleton() {
  return (
    <ul role="status" aria-label="Loading products">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i}>
          <span className="skeleton" style={{ width: `${11 + (i % 3) * 2}em` }} />
        </li>
      ))}
    </ul>
  );
}

export function ProductInfoSkeleton() {
  return (
    <h1 role="status" aria-label="Loading product">
      <span className="skeleton" style={{ width: "14em" }} />
    </h1>
  );
}
