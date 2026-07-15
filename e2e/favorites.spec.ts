import { expect, test, type Page } from "@playwright/test";

async function signInAsAlice(page: Page) {
  await page.getByRole("button", { name: "Sign in as Alice" }).click();
  await expect(page.getByText("Signed in as Alice")).toBeVisible();
}

test("favorite toggles optimistically and stays consistent across pages", async ({
  page,
}) => {
  await page.goto("/products?category=gaming");
  await signInAsAlice(page);
  const listButton = page
    .getByRole("listitem")
    .filter({ hasText: "Mechanical Keyboard" })
    .getByRole("button");
  await expect(listButton).toHaveText("☆ Favorite");

  // Optimistic: flips before the 400ms external API round-trip completes.
  await listButton.click();
  await expect(listButton).toHaveText("★ Favorited");

  // Client-side navigation: the same store instance backs the detail page.
  await page.getByRole("link", { name: "Mechanical Keyboard" }).click();
  const detailButton = page
    .getByRole("heading", { name: /Mechanical Keyboard/ })
    .getByRole("button");
  await expect(detailButton).toHaveText("★ Favorited");
  await expect(detailButton).toHaveAttribute("aria-busy", "false");

  // Hard reload: state comes back from the per-user favorites endpoint, so
  // the write persisted server-side.
  await page.reload();
  await expect(detailButton).toHaveText("★ Favorited");

  // Toggle back to leave the service in its seed state.
  await detailButton.click();
  await expect(detailButton).toHaveText("☆ Favorite");
  await expect(detailButton).toHaveAttribute("aria-busy", "false");
});

test("out-of-band favorite changes converge on the next server render", async ({
  page,
  request,
}) => {
  await page.goto("/products/p9");
  await signInAsAlice(page);
  const detailButton = page
    .getByRole("heading", { name: /Mechanical Keyboard/ })
    .getByRole("button");
  await expect(detailButton).toHaveText("☆ Favorite");

  // "Another device" favorites p9 directly against the external service.
  await request.post("/api/users/u1/favorites", {
    data: { productId: "p9", favorite: true },
  });
  // The store hasn't seen a server render yet, so nothing changes...
  await expect(detailButton).toHaveText("☆ Favorite");

  // ...until any server re-render (here the restock action's refresh())
  // delivers a fresh snapshot, which the provider merges into the store.
  await page.getByRole("button", { name: "Request restock" }).click();
  await expect(detailButton).toHaveText("★ Favorited");

  // Restore seed state directly on the service.
  await request.post("/api/users/u1/favorites", {
    data: { productId: "p9", favorite: false },
  });
});

test("navigating away while a mutation is in flight still lands it", async ({
  page,
}) => {
  await page.goto("/products/p10");
  await signInAsAlice(page);
  const detailButton = page
    .getByRole("heading", { name: /Gaming Mouse/ })
    .getByRole("button");
  await expect(detailButton).toHaveText("☆ Favorite");

  // Click and navigate away immediately: the store owns the request, so
  // unmounting the button does not cancel or orphan it.
  await detailButton.click();
  await page.getByRole("link", { name: "← All products" }).click();
  await page.getByRole("combobox").selectOption("gaming");

  const listButton = page
    .getByRole("listitem")
    .filter({ hasText: "Gaming Mouse" })
    .getByRole("button");
  await expect(listButton).toHaveText("★ Favorited");
  await expect(listButton).toHaveAttribute("aria-busy", "false");

  // The write reached the server even though we navigated mid-request.
  await page.reload();
  await expect(listButton).toHaveText("★ Favorited");

  await listButton.click();
  await expect(listButton).toHaveText("☆ Favorite");
  await expect(listButton).toHaveAttribute("aria-busy", "false");
});
