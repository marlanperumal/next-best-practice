// Server-side data layer: the only place the app talks to the external API.
// `server-only` makes accidental client imports a build error.
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  favoriteSchema,
  productListSchema,
  productSchema,
  restockSchema,
  reviewListSchema,
  reviewSchema,
  userSchema,
  type Category,
} from "./schemas";

const BASE_URL = process.env.EXTERNAL_API_URL ?? "http://localhost:3000/api";

// --- Shared, cacheable-for-everyone data: opts into 'use cache' + tags. ---

export async function getProducts(params: {
  category: Category | null;
  q: string;
  page: number;
}) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const search = new URLSearchParams({ page: String(params.page) });
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  const res = await fetch(`${BASE_URL}/products?${search}`);
  if (!res.ok) throw new Error(`Product list failed: ${res.status}`);
  return productListSchema.parse(await res.json());
}

export async function getProduct(id: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", `product:${id}`);
  const res = await fetch(`${BASE_URL}/products/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Product ${id} failed: ${res.status}`);
  return productSchema.parse(await res.json());
}

export async function getReviews(productId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`reviews:${productId}`);
  const res = await fetch(`${BASE_URL}/products/${productId}/reviews`);
  if (!res.ok)
    throw new Error(`Reviews for ${productId} failed: ${res.status}`);
  return reviewListSchema.parse(await res.json());
}

// --- Per-user data: deliberately uncached (a shared cache entry would leak
// one user's state into another's response). Request-level dedup happens via
// React.cache in lib/auth.ts, not via the shared cache. ---

export async function getUser(id: string) {
  const res = await fetch(`${BASE_URL}/users/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`User ${id} failed: ${res.status}`);
  return userSchema.parse(await res.json());
}

export async function getFavoriteIds(userId: string): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/users/${userId}/favorites`);
  if (!res.ok) throw new Error(`Favorites for ${userId} failed: ${res.status}`);
  return res.json();
}

// Background-job status: per-user AND uncached — a job's whole point is
// that its state changes out-of-band, so every render reads it fresh.
export async function getRestockStatus(productId: string, userId: string) {
  const res = await fetch(
    `${BASE_URL}/products/${productId}/restock?userId=${userId}`,
  );
  if (!res.ok) throw new Error(`Restock status failed: ${res.status}`);
  const data = await res.json();
  return data === null ? null : restockSchema.parse(data);
}

// --- Mutations, called from Server Actions only. ---

export async function postRestockRequest(productId: string, userId: string) {
  const res = await fetch(`${BASE_URL}/products/${productId}/restock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(`Restock request failed: ${res.status}`);
  return restockSchema.parse(await res.json());
}

export async function postFavorite(
  userId: string,
  productId: string,
  favorite: boolean,
) {
  const res = await fetch(`${BASE_URL}/users/${userId}/favorites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, favorite }),
  });
  if (!res.ok) throw new Error(`Favorite update failed: ${res.status}`);
  return favoriteSchema.parse(await res.json());
}

export async function postReview(
  productId: string,
  review: { author: string; rating: number; body: string },
) {
  const res = await fetch(`${BASE_URL}/products/${productId}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(review),
  });
  if (!res.ok) throw new Error(`Review create failed: ${res.status}`);
  return reviewSchema.parse(await res.json());
}

export async function postReviewHelpful(reviewId: string) {
  const res = await fetch(`${BASE_URL}/reviews/${reviewId}/helpful`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Helpful vote failed: ${res.status}`);
  return reviewSchema.parse(await res.json());
}
