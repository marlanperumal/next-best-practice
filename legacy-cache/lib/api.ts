// Previous-model data layer: caching is opted into PER FETCH via the `next`
// options (Data Cache), and non-fetch work is cached with unstable_cache.
// Compare lib/api/client.ts in the main app, where the same reads use
// 'use cache' + cacheLife + cacheTag.
import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";

const BASE_URL = process.env.EXTERNAL_API_URL ?? "http://localhost:3000/api";

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  price: z.number(),
  description: z.string(),
});

const reviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  author: z.string(),
  rating: z.number(),
  body: z.string(),
  helpful: z.number(),
});

export type Review = z.infer<typeof reviewSchema>;

export async function getProducts() {
  const res = await fetch(`${BASE_URL}/products?pageSize=12`, {
    // Data Cache: this response is cached for 60s and tagged, regardless of
    // whether the route rendering it is static or dynamic.
    next: { revalidate: 60, tags: ["products"] },
  });
  if (!res.ok) throw new Error(`Product list failed: ${res.status}`);
  const data = await res.json();
  return z.array(productSchema).parse(data.items);
}

export async function getProduct(id: string) {
  const res = await fetch(`${BASE_URL}/products/${id}`, {
    next: { revalidate: 60, tags: ["products", `product:${id}`] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Product ${id} failed: ${res.status}`);
  return productSchema.parse(await res.json());
}

export async function getReviews(productId: string) {
  const res = await fetch(`${BASE_URL}/products/${productId}/reviews`, {
    next: { revalidate: 300, tags: [`reviews:${productId}`] },
  });
  if (!res.ok) throw new Error(`Reviews failed: ${res.status}`);
  return z.array(reviewSchema).parse(await res.json());
}

// unstable_cache: the previous model's tool for caching non-fetch work
// (here a computed aggregate). Created per call so the cache key and tags
// can include the argument — the documented dynamic-tags pattern.
export function getReviewSummary(productId: string) {
  return unstable_cache(
    async () => {
      const reviews = await getReviews(productId);
      const count = reviews.length;
      const average = count
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / count
        : null;
      return { count, average };
    },
    ["review-summary", productId],
    { revalidate: 300, tags: [`reviews:${productId}`] },
  )();
}

export async function postReviewHelpful(reviewId: string) {
  const res = await fetch(`${BASE_URL}/reviews/${reviewId}/helpful`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Helpful vote failed: ${res.status}`);
}
