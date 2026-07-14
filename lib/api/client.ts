// Server-side data layer: the only place the app talks to the external API.
// `server-only` makes accidental client imports a build error.
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  productListSchema,
  productSchema,
  reviewListSchema,
  type Category,
} from "./schemas";

const BASE_URL = process.env.EXTERNAL_API_URL ?? "http://localhost:3000/api";

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
  if (!res.ok) throw new Error(`Reviews for ${productId} failed: ${res.status}`);
  return reviewListSchema.parse(await res.json());
}

// Per-user-style data: deliberately uncached, read fresh on every request.
export async function getFavoriteIds(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/favorites`);
  if (!res.ok) throw new Error(`Favorites failed: ${res.status}`);
  return res.json();
}

export async function patchFavorite(id: string, favorite: boolean) {
  const res = await fetch(`${BASE_URL}/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite }),
  });
  if (!res.ok) throw new Error(`Favorite update for ${id} failed: ${res.status}`);
  return productSchema.parse(await res.json());
}
