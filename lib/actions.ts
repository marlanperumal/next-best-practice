"use server";

import { refresh, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  getUser,
  postFavorite,
  postRestockRequest,
  postReview,
  postReviewHelpful,
} from "./api/client";
import { getCurrentUser } from "./auth";

// Server Actions are public HTTP endpoints: validate arguments and check
// auth inside every action, never only in the UI that calls it.

const setFavoriteInput = z.object({ id: z.string(), favorite: z.boolean() });

export async function setFavorite(input: z.infer<typeof setFavoriteInput>) {
  const { id, favorite } = setFavoriteInput.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  const result = await postFavorite(user.id, id, favorite);
  // Favorites are per-user and never enter the shared cache, so there is no
  // tag to invalidate — mutations of uncached data end here.
  return result.favorite;
}

const addReviewInput = z.object({
  productId: z.string(),
  author: z.string().min(1, "Name is required"),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().min(1, "Review text is required"),
});

export type AddReviewState = {
  ok: boolean;
  errors?: Partial<Record<"author" | "rating" | "body", string[]>>;
  values?: { author: string; body: string };
};

export async function addReview(
  _prev: AddReviewState,
  formData: FormData,
): Promise<AddReviewState> {
  const raw = Object.fromEntries(formData);
  const parsed = addReviewInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: z.flattenError(parsed.error).fieldErrors,
      // Echo values back so the form can repopulate after React's auto-reset.
      values: { author: String(raw.author ?? ""), body: String(raw.body ?? "") },
    };
  }
  const { productId, ...review } = parsed.data;
  await postReview(productId, review);
  // updateTag expires the cache and refreshes within this request, so the
  // action's own response already shows the new review (read-your-own-writes).
  updateTag(`reviews:${productId}`);
  return { ok: true };
}

const helpfulInput = z.object({ productId: z.string(), reviewId: z.string() });

export async function markReviewHelpful(input: z.infer<typeof helpfulInput>) {
  const { productId, reviewId } = helpfulInput.parse(input);
  await postReviewHelpful(reviewId);
  updateTag(`reviews:${productId}`);
}

export async function requestRestock(input: { productId: string }) {
  const productId = z.string().parse(input.productId);
  await postRestockRequest(productId);
  // Restock status is uncached, so there is no tag to expire — but the
  // client router still holds the old RSC payload. refresh() re-renders it
  // in this same round trip without touching any cached ('use cache') data.
  refresh();
}

export async function signInAs(userId: string) {
  const user = await getUser(z.string().parse(userId));
  if (!user) throw new Error("Unknown user");
  (await cookies()).set("session-user", user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function signOut() {
  (await cookies()).delete("session-user");
}
