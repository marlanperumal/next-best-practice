import { Suspense, type ReactNode } from "react";
import { VisibilityRefetcher } from "@/components/refreshers";
import { getFavoriteIds } from "#api/client";
import { getCurrentUser } from "@/lib/auth";
import { FavoritesStoreProvider } from "@/stores/favorites-store-provider";

// The provider lives in a layout so the store survives navigation between
// the list and detail pages. The uncached per-user fetch is a dynamic hole
// under Suspense; the rest of the shell prerenders around it.
export default function ProductsLayout({ children }: LayoutProps<"/products">) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <WithFavorites>{children}</WithFavorites>
    </Suspense>
  );
}

async function WithFavorites({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const initialFavoriteIds = user ? await getFavoriteIds(user.id) : [];
  return (
    // key: the store is created once per provider instance, so a prop change
    // alone would NOT re-hydrate it. Keying by user remounts the provider on
    // sign-in/out, discarding the previous user's client state.
    <FavoritesStoreProvider
      key={user?.id ?? "signed-out"}
      initialFavoriteIds={initialFavoriteIds}
    >
      <VisibilityRefetcher />
      {children}
    </FavoritesStoreProvider>
  );
}
