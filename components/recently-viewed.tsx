"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRecentlyViewedStore } from "@/stores/recently-viewed-store";

// persist uses skipHydration, so storage is only read after mount: server
// HTML and the client's first render agree (empty), then the list appears.
function rehydrate() {
  const { persist } = useRecentlyViewedStore;
  if (!persist.hasHydrated()) void persist.rehydrate();
}

export function RecentlyViewed() {
  const items = useRecentlyViewedStore((s) => s.items);
  const hydrated = useRecentlyViewedStore((s) => s.hydrated);

  useEffect(() => {
    rehydrate();
  }, []);

  if (!hydrated || items.length === 0) return null;
  return (
    <aside>
      <h2>Recently viewed</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/products/${item.id}`}>{item.name}</Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function RecordRecentlyViewed({ id, name }: { id: string; name: string }) {
  const record = useRecentlyViewedStore((s) => s.record);

  useEffect(() => {
    rehydrate();
    record({ id, name });
  }, [id, name, record]);

  return null;
}
