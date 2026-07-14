"use client";

import { useActionState } from "react";
import { addReview, type AddReviewState } from "@/lib/actions";

const initialState: AddReviewState = { ok: false };

// Form mutation via useActionState: pending state, server-side validation
// errors returned as state, and values echoed back so React 19's automatic
// form reset doesn't wipe the user's input on a failed submit. On success,
// the action's updateTag refreshes the server-rendered review list in the
// same round trip — no client refetch code.
export function AddReviewForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(addReview, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="productId" value={productId} />
      <label>
        Name <input name="author" defaultValue={state.values?.author} />
      </label>
      {state.errors?.author && <p role="alert">{state.errors.author[0]}</p>}
      <label>
        Rating{" "}
        <select name="rating" defaultValue="5">
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        Review <textarea name="body" defaultValue={state.values?.body} />
      </label>
      {state.errors?.body && <p role="alert">{state.errors.body[0]}</p>}
      <button disabled={pending}>Add review</button>
      {state.ok && <p role="status">Review added</p>}
    </form>
  );
}
