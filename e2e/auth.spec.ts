import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, name: string) {
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
}

test("session controls what the server renders", async ({ page }) => {
  await page.goto("/products?category=audio");
  // Signed out: no favorite buttons at all.
  await expect(page.getByText("Signed out")).toBeVisible();
  await expect(page.getByRole("button", { name: /Favorite/ })).toHaveCount(0);

  await signInAs(page, "Alice");
  // Alice's seed favorites include the USB Microphone.
  const micButton = page
    .getByRole("listitem")
    .filter({ hasText: "USB Microphone" })
    .getByRole("button");
  await expect(micButton).toHaveText("★ Favorited");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Signed out")).toBeVisible();
  await expect(page.getByRole("button", { name: /Favorite/ })).toHaveCount(0);
});

test("switching user remounts the store via the provider key", async ({
  page,
}) => {
  await page.goto("/products?category=audio");
  await signInAs(page, "Alice");
  const micButton = page
    .getByRole("listitem")
    .filter({ hasText: "USB Microphone" })
    .getByRole("button");
  await expect(micButton).toHaveText("★ Favorited");

  // Bob has no favorites: the keyed provider must discard Alice's store.
  await signInAs(page, "Bob");
  await expect(micButton).toHaveText("☆ Favorite");
});

test("the user lookup is deduped per request by React.cache", async ({
  page,
  request,
}) => {
  await page.goto("/products");
  await signInAs(page, "Alice");

  const read = async () =>
    ((await (await request.get("/api/stats")).json()).user as number) ?? 0;

  const before = await read();
  // One request in which at least three components ask for the current user
  // (nav UserMenu, the favorites layout, and ProductList).
  await page.goto("/products?category=audio");
  await expect(page.getByRole("listitem")).toHaveCount(4);
  const after = await read();

  // Deduped: one upstream lookup (small allowance for a link prefetch).
  // Without React.cache this would be 3+.
  expect(after - before).toBeGreaterThanOrEqual(1);
  expect(after - before).toBeLessThanOrEqual(2);
});
