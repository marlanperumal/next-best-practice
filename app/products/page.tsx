import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { Pagination } from "@/components/pagination";
import { ProductFilters } from "@/components/product-filters";
import { RecentlyViewed } from "@/components/recently-viewed";
import { getProducts } from "@/lib/api/client";
import { loadProductListParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Products" };

// The page itself stays synchronous so filters render in the static shell;
// only ProductList waits on searchParams and data.
export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <>
      <h1>Products</h1>
      <ProductFilters />
      <Suspense fallback={<p>Loading products…</p>}>
        <ProductList searchParams={searchParams} />
      </Suspense>
      <RecentlyViewed />
    </>
  );
}

async function ProductList({
  searchParams,
}: {
  searchParams: PageProps<"/products">["searchParams"];
}) {
  const { category, q, page } = await loadProductListParams(searchParams);
  const { items, total, pageSize } = await getProducts({ category, q, page });

  if (items.length === 0) return <p>No products found.</p>;
  return (
    <>
      <ul>
        {items.map((product) => (
          <li key={product.id}>
            <Link href={`/products/${product.id}`}>{product.name}</Link>{" "}
            (${product.price}) <FavoriteButton productId={product.id} />
          </li>
        ))}
      </ul>
      <Pagination totalPages={Math.ceil(total / pageSize)} />
    </>
  );
}
