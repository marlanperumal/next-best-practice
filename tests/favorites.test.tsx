// Integration test for the optimistic favorites flow: real store, real
// server-action module, network mocked with MSW.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { describe, expect, it } from "vitest";
import { FavoriteButton } from "@/components/favorite-button";
import { FavoritesStoreProvider } from "@/stores/favorites-store-provider";
import { server } from "./mocks/server";

// Both pages render the same product's button; the shared store must keep
// them consistent.
function renderButtons(initialFavoriteIds: string[] = []) {
  render(
    <FavoritesStoreProvider initialFavoriteIds={initialFavoriteIds}>
      <div data-testid="list-page">
        <FavoriteButton productId="p1" />
      </div>
      <div data-testid="detail-page">
        <FavoriteButton productId="p1" />
      </div>
    </FavoritesStoreProvider>,
  );
  const [listButton, detailButton] = screen.getAllByRole("button");
  return { listButton, detailButton };
}

describe("favorites store", () => {
  it("hydrates from server-provided initial state", () => {
    const { listButton } = renderButtons(["p1"]);
    expect(listButton).toHaveTextContent("★ Favorited");
  });

  it("toggles optimistically and keeps both pages consistent", async () => {
    const user = userEvent.setup();
    const { listButton, detailButton } = renderButtons();

    await user.click(listButton);
    // Optimistic: both buttons flip before the request settles.
    expect(listButton).toHaveAttribute("aria-pressed", "true");
    expect(detailButton).toHaveAttribute("aria-pressed", "true");
    expect(listButton).toHaveAttribute("aria-busy", "true");

    await waitFor(() => expect(listButton).toHaveAttribute("aria-busy", "false"));
    expect(detailButton).toHaveAttribute("aria-pressed", "true");
  });

  it("reverts the optimistic update when the mutation fails", async () => {
    server.use(
      http.patch("http://localhost:3000/api/products/p1", async () => {
        await delay(50);
        return HttpResponse.json({ error: "boom" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    const { listButton } = renderButtons();

    await user.click(listButton);
    expect(listButton).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(listButton).toHaveAttribute("aria-busy", "false"));
    expect(listButton).toHaveAttribute("aria-pressed", "false");
  });

  it("settles on the last click when toggled rapidly", async () => {
    server.use(
      http.patch("http://localhost:3000/api/products/p1", async ({ request }) => {
        const body = (await request.json()) as { favorite: boolean };
        await delay(150);
        return HttpResponse.json({
          id: "p1",
          name: "Studio Headphones",
          category: "audio",
          price: 199,
          description: "Closed-back.",
          favorite: body.favorite,
        });
      }),
    );
    const user = userEvent.setup();
    const { listButton } = renderButtons();

    await user.click(listButton); // on
    await user.click(listButton); // off again, while the first is in flight
    await waitFor(() => expect(listButton).toHaveAttribute("aria-busy", "false"));
    expect(listButton).toHaveAttribute("aria-pressed", "false");
  });
});
