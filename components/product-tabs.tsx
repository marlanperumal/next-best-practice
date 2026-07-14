"use client";

import { useQueryState } from "nuqs";
import { useTransition } from "react";
import { productTabParams, tabs } from "@/lib/search-params";

export function ProductTabs() {
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useQueryState(
    "tab",
    productTabParams.tab.withOptions({ shallow: false, startTransition }),
  );

  return (
    <div role="tablist" aria-busy={isPending}>
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={tab === t}
          onClick={() => setTab(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
