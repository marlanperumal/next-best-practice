import { Suspense, type ReactNode } from "react";
import { getFavoriteIds } from "@/lib/api/client";
import { FavoritesStoreProvider } from "@/stores/favorites-store-provider";

// The provider lives in a layout so the store survives navigation between
// the list and detail pages. The uncached favorites fetch is a dynamic hole
// under Suspense; the rest of the shell prerenders around it.
export default function ProductsLayout({ children }: LayoutProps<"/products">) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <WithFavorites>{children}</WithFavorites>
    </Suspense>
  );
}

async function WithFavorites({ children }: { children: ReactNode }) {
  const initialFavoriteIds = await getFavoriteIds();
  return (
    <FavoritesStoreProvider initialFavoriteIds={initialFavoriteIds}>
      {children}
    </FavoritesStoreProvider>
  );
}
