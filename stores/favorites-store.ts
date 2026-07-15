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
  mergeServer: (serverFavoriteIds: string[]) => void;
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

    // Reconcile with a fresh server snapshot (the provider calls this on
    // every server re-render): the server wins for settled ids, in-flight
    // optimistic values win until their mutation resolves. A snapshot that
    // started rendering before a mutation settled can still briefly revert
    // it — the next refresh converges; real apps close that gap with
    // per-entity versions from the server.
    mergeServer: (serverFavoriteIds) =>
      set((state) => {
        const next = new Set(serverFavoriteIds);
        for (const id of state.pendingIds) {
          if (state.favoriteIds.has(id)) next.add(id);
          else next.delete(id);
        }
        return { favoriteIds: next };
      }),

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
