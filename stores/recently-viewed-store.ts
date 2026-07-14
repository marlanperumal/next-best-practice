"use client";

// Client-originated store: state never exists on the server, so a
// module-level store is safe here (contrast with the favorites store).
// Persisted to localStorage; skipHydration + an explicit rehydrate on mount
// keep server HTML and the client's first render identical.
import { create } from "zustand";
import { persist } from "zustand/middleware";

type ViewedProduct = { id: string; name: string };

type RecentlyViewedStore = {
  items: ViewedProduct[];
  hydrated: boolean;
  record: (item: ViewedProduct) => void;
  setHydrated: () => void;
};

const MAX_ITEMS = 5;

export const useRecentlyViewedStore = create<RecentlyViewedStore>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      record: (item) =>
        set((state) => ({
          items: [item, ...state.items.filter((i) => i.id !== item.id)].slice(
            0,
            MAX_ITEMS,
          ),
        })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "recently-viewed",
      skipHydration: true,
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: (state) => () => state.setHydrated(),
    },
  ),
);
