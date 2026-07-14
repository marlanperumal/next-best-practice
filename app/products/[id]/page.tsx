import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddReviewForm } from "@/components/add-review-form";
import { FavoriteButton } from "@/components/favorite-button";
import { HelpfulButton } from "@/components/helpful-button";
import { ProductTabs } from "@/components/product-tabs";
import { RecordRecentlyViewed } from "@/components/recently-viewed";
import { getProduct, getReviews } from "@/lib/api/client";
import { getCurrentUser } from "@/lib/auth";
import { loadProductTabParams } from "@/lib/search-params";

type Props = PageProps<"/products/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // Cached, so this and ProductInfo share one request per revalidation.
  const product = await getProduct(id);
  return { title: product?.name ?? "Not found" };
}

// Two sibling async components under separate Suspense boundaries fetch the
// product and the tab panel in parallel, each streaming in when ready.
export default function ProductPage({ params, searchParams }: Props) {
  return (
    <article>
      <Suspense fallback={<p>Loading product…</p>}>
        <ProductInfo params={params} />
      </Suspense>
      <ProductTabs />
      <Suspense fallback={<p>Loading…</p>}>
        <TabPanel params={params} searchParams={searchParams} />
      </Suspense>
      <p>
        <Link href="/products">← All products</Link>
      </p>
    </article>
  );
}

async function ProductInfo({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const [product, user] = await Promise.all([getProduct(id), getCurrentUser()]);
  if (!product) notFound();
  return (
    <>
      <RecordRecentlyViewed id={product.id} name={product.name} />
      <h1>
        {product.name} {user && <FavoriteButton productId={product.id} />}
      </h1>
    </>
  );
}

async function TabPanel({
  params,
  searchParams,
}: {
  params: Props["params"];
  searchParams: Props["searchParams"];
}) {
  const [{ id }, { tab }] = await Promise.all([
    params,
    loadProductTabParams(searchParams),
  ]);

  if (tab === "details") {
    const product = await getProduct(id);
    if (!product) return null;
    return (
      <dl>
        <dt>Category</dt>
        <dd>{product.category}</dd>
        <dt>Price</dt>
        <dd>${product.price}</dd>
        <dt>Description</dt>
        <dd>{product.description}</dd>
      </dl>
    );
  }

  // Nested sub-resource fetch: streams independently of the product info.
  const reviews = await getReviews(id);
  return (
    <>
      {reviews.length === 0 ? (
        <p>No reviews yet.</p>
      ) : (
        <ul>
          {reviews.map((review) => (
            <li key={review.id}>
              {review.rating}/5 by {review.author}: {review.body}{" "}
              <HelpfulButton
                productId={id}
                reviewId={review.id}
                helpful={review.helpful}
              />
            </li>
          ))}
        </ul>
      )}
      <AddReviewForm productId={id} />
    </>
  );
}
