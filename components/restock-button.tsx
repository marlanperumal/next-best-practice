"use client";

import { useTransition } from "react";
import { requestRestock } from "@/lib/actions";

export function RestockButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => requestRestock({ productId }))}
    >
      Request restock
    </button>
  );
}
