"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { patchFavorite } from "./api/client";

// Server Actions are public HTTP endpoints: validate arguments (and check
// auth, in a real app) before acting on them.
const setFavoriteInput = z.object({ id: z.string(), favorite: z.boolean() });

export async function setFavorite(input: z.infer<typeof setFavoriteInput>) {
  const { id, favorite } = setFavoriteInput.parse(input);
  const product = await patchFavorite(id, favorite);
  // updateTag expires the cache and refreshes within this request, so the
  // action's own response already reflects the write (read-your-own-writes).
  updateTag("products");
  return product.favorite;
}
