"use client";

// Zustand's recommended Next.js setup: no module-level store. The store is
// created once per provider mount (i.e. per request during SSR), so requests
// never share state and the client store survives soft navigations.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { createFavoritesStore, type FavoritesStore } from "./favorites-store";

type FavoritesStoreApi = ReturnType<typeof createFavoritesStore>;

const FavoritesStoreContext = createContext<FavoritesStoreApi | null>(null);

export function FavoritesStoreProvider({
  initialFavoriteIds,
  children,
}: {
  initialFavoriteIds: string[];
  children: ReactNode;
}) {
  const [store] = useState(() => createFavoritesStore(initialFavoriteIds));

  // The store is created once, so prop changes alone don't reach it. Server
  // re-renders (refresh(), router.refresh(), revalidation) deliver a fresh
  // snapshot here; merge it in so out-of-band changes converge instead of
  // the store staying client-authoritative forever.
  useEffect(() => {
    store.getState().mergeServer(initialFavoriteIds);
  }, [store, initialFavoriteIds]);

  return (
    <FavoritesStoreContext.Provider value={store}>
      {children}
    </FavoritesStoreContext.Provider>
  );
}

export function useFavoritesStore<T>(selector: (store: FavoritesStore) => T): T {
  const store = useContext(FavoritesStoreContext);
  if (!store) {
    throw new Error("useFavoritesStore must be used within FavoritesStoreProvider");
  }
  return useStore(store, selector);
}
