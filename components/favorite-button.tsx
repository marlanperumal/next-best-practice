"use client";

import { useFavoritesStore } from "@/stores/favorites-store-provider";

export function FavoriteButton({ productId }: { productId: string }) {
  const favorite = useFavoritesStore((s) => s.favoriteIds.has(productId));
  const pending = useFavoritesStore((s) => s.pendingIds.has(productId));
  const toggle = useFavoritesStore((s) => s.toggle);

  // Fire-and-forget: the returned promise is owned by the store, not this
  // component, so navigating away mid-request is safe.
  return (
    <button
      aria-pressed={favorite}
      aria-busy={pending}
      onClick={() => void toggle(productId)}
    >
      {favorite ? "★ Favorited" : "☆ Favorite"}
    </button>
  );
}
