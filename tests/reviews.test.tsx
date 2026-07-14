// Integration tests for the review interactions: real action modules, real
// hooks, network mocked with MSW. Canonical-value convergence after
// updateTag needs a real server render, so that half lives in e2e/.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { Component, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { AddReviewForm } from "@/components/add-review-form";
import { HelpfulButton } from "@/components/helpful-button";
import { server } from "./mocks/server";

describe("AddReviewForm (useActionState)", () => {
  it("returns validation errors and preserves input across the auto-reset", async () => {
    const user = userEvent.setup();
    render(<AddReviewForm productId="p1" />);

    await user.type(screen.getByLabelText(/Name/), "Zoe");
    await user.click(screen.getByRole("button", { name: "Add review" }));

    // Server-side validation failed on the empty body...
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Review text is required",
    );
    // ...but the typed name survived React 19's automatic form reset because
    // the action echoes values back as defaultValues.
    expect(screen.getByLabelText(/Name/)).toHaveValue("Zoe");
  });

  it("submits a valid review", async () => {
    const user = userEvent.setup();
    render(<AddReviewForm productId="p1" />);

    await user.type(screen.getByLabelText(/Name/), "Zoe");
    await user.type(screen.getByLabelText(/Review/), "Great value.");
    await user.click(screen.getByRole("button", { name: "Add review" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Review added");
  });
});

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p role="alert">Something broke</p> : this.props.children;
  }
}

describe("HelpfulButton (useOptimistic)", () => {
  it("bumps the count optimistically while the action is pending", async () => {
    const user = userEvent.setup();
    render(<HelpfulButton productId="p1" reviewId="r1" helpful={2} />);

    const button = screen.getByRole("button");
    await user.click(button);
    expect(button).toHaveTextContent("Helpful (3)");
    expect(button).toBeDisabled();

    await waitFor(() => expect(button).toBeEnabled());
  });

  it("auto-reverts and surfaces the error at the boundary on failure", async () => {
    server.use(
      http.post("http://localhost:3000/api/reviews/r1/helpful", async () => {
        await delay(50);
        return HttpResponse.json({ error: "boom" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    render(
      <Boundary>
        <HelpfulButton productId="p1" reviewId="r1" helpful={2} />
      </Boundary>,
    );

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Helpful (3)");

    // The thrown action reaches the error boundary (in the app,
    // app/products/error.tsx) — never a silent console-only failure.
    expect(await screen.findByRole("alert")).toHaveTextContent("Something broke");
  });
});
