// Server-originated store: created per request (see the provider), hydrated
// with server-fetched state, then mutated optimistically on the client.
import { createStore } from "zustand/vanilla";
import { setFavorite } from "@/lib/actions";

export type FavoritesState = {
  favoriteIds: Set<string>;
  pendingIds: Set<string>;
};

export type FavoritesActions = {
  toggle: (id: string) => Promise<void>;
};

export type FavoritesStore = FavoritesState & FavoritesActions;

export function createFavoritesStore(initialFavoriteIds: string[]) {
  // Per-id request versions: if the user toggles again while a request is in
  // flight, only the latest request is allowed to reconcile or revert state.
  const versions = new Map<string, number>();

  const withId = (ids: Set<string>, id: string, include: boolean) => {
    const next = new Set(ids);
    if (include) next.add(id);
    else next.delete(id);
    return next;
  };

  return createStore<FavoritesStore>()((set, get) => ({
    favoriteIds: new Set(initialFavoriteIds),
    pendingIds: new Set(),

    toggle: async (id) => {
      const next = !get().favoriteIds.has(id);
      const version = (versions.get(id) ?? 0) + 1;
      versions.set(id, version);

      // Optimistic: flip immediately, reconcile when the server responds.
      set((state) => ({
        favoriteIds: withId(state.favoriteIds, id, next),
        pendingIds: withId(state.pendingIds, id, true),
      }));

      try {
        const confirmed = await setFavorite({ id, favorite: next });
        if (versions.get(id) !== version) return;
        set((state) => ({
          favoriteIds: withId(state.favoriteIds, id, confirmed),
          pendingIds: withId(state.pendingIds, id, false),
        }));
      } catch {
        if (versions.get(id) !== version) return;
        set((state) => ({
          favoriteIds: withId(state.favoriteIds, id, !next),
          pendingIds: withId(state.pendingIds, id, false),
        }));
      }
    },
  }));
}
