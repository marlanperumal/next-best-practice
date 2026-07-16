import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { Pagination } from "@/components/pagination";
import { ProductFilters } from "@/components/product-filters";
import { RecentlyViewed } from "@/components/recently-viewed";
import { ProductListSkeleton } from "@/components/skeletons";
import { getProducts } from "#api/client";
import { getCurrentUser } from "@/lib/auth";
import {
  loadProductListParams,
  serializeProductListParams,
} from "@/lib/search-params";

export const metadata: Metadata = { title: "Products" };

// The page itself stays synchronous so filters render in the static shell;
// only ProductList waits on searchParams and data.
export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <>
      <h1>Products</h1>
      <ProductFilters />
      <Suspense fallback={<ProductListSkeleton />}>
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
  // Independent reads run in parallel; getCurrentUser is deduped per request
  // via React.cache, so this costs nothing extra beyond the first caller.
  const [{ items, total, pageSize }, user] = await Promise.all([
    getProducts({ category, q, page }),
    getCurrentUser(),
  ]);

  // Guard against out-of-range pages (deep link, or a filter shrank the
  // results): redirect to the last valid page instead of rendering nothing.
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) {
    redirect(
      serializeProductListParams("/products", {
        category,
        q,
        page: totalPages,
      }),
    );
  }

  if (items.length === 0) return <p>No products found.</p>;
  return (
    <>
      <ul>
        {items.map((product) => (
          <li key={product.id}>
            <Link href={`/products/${product.id}`}>{product.name}</Link> ($
            {product.price}) {user && <FavoriteButton productId={product.id} />}
          </li>
        ))}
      </ul>
      <Pagination totalPages={totalPages} />
    </>
  );
}
