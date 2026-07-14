"use client";

import { useOptimistic, useTransition } from "react";
import { markReviewHelpful } from "@/lib/actions";

// useOptimistic, for contrast with the favorites store: right when the state
// has a single surface and doesn't need to outlive this component. The
// canonical value is the server-rendered prop; the optimistic bump shows
// during the transition, and the action's updateTag refresh delivers the new
// canonical value. On failure it auto-reverts and the error surfaces at the
// segment error boundary.
export function HelpfulButton({
  productId,
  reviewId,
  helpful,
}: {
  productId: string;
  reviewId: string;
  helpful: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticHelpful, bump] = useOptimistic(
    helpful,
    (count: number) => count + 1,
  );

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          bump(undefined);
          await markReviewHelpful({ productId, reviewId });
        })
      }
    >
      Helpful ({optimisticHelpful})
    </button>
  );
}
