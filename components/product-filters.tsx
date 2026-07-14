"use client";

import { debounce, useQueryStates } from "nuqs";
import { useTransition } from "react";
import { categories, productListParams } from "@/lib/search-params";

export function ProductFilters() {
  const [isPending, startTransition] = useTransition();
  // shallow: false re-runs the server components that read these params;
  // startTransition exposes that round-trip as a pending state.
  const [{ category, q }, setParams] = useQueryStates(productListParams, {
    shallow: false,
    startTransition,
  });

  return (
    <fieldset aria-busy={isPending}>
      <input
        type="search"
        placeholder="Search products"
        defaultValue={q}
        onChange={(e) =>
          // Reset page whenever the filter changes, debounce keystrokes.
          setParams(
            { q: e.target.value || null, page: null },
            { limitUrlUpdates: debounce(300) },
          )
        }
      />
      <select
        value={category ?? ""}
        onChange={(e) =>
          setParams({
            category: (e.target.value || null) as typeof category,
            page: null,
          })
        }
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {isPending && <span role="status">Updating…</span>}
    </fieldset>
  );
}
