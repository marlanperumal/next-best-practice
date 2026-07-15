"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { postReviewHelpful } from "./api";

export async function markHelpful(productId: string, reviewId: string) {
  await postReviewHelpful(z.string().parse(reviewId));
  // Previous-model invalidation: purge the tagged Data Cache and ISR pages
  // that used it. { expire: 0 } = immediately, so the action's own
  // re-render already shows the new count. (updateTag does this in the
  // Cache Components model; it throws without cacheComponents.)
  revalidateTag(`reviews:${z.string().parse(productId)}`, { expire: 0 });
}
