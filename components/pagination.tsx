"use client";

import { useQueryState } from "nuqs";
import { useTransition } from "react";
import { productListParams } from "@/lib/search-params";

export function Pagination({ totalPages }: { totalPages: number }) {
  const [isPending, startTransition] = useTransition();
  // history: "push" so the browser back button steps through pages; filter
  // and tab changes keep the default "replace".
  const [page, setPage] = useQueryState(
    "page",
    productListParams.page.withOptions({
      shallow: false,
      history: "push",
      startTransition,
    }),
  );

  return (
    <nav aria-busy={isPending}>
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}
