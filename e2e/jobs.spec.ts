import { expect, test } from "@playwright/test";

test("background job: refresh() shows pending, the poller reveals completion", async ({
  page,
}) => {
  await page.goto("/products/p3");
  // Restock is per-user: the panel only renders for a session.
  await expect(page.getByRole("button", { name: "Request restock" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in as Alice" }).click();
  await page.getByRole("button", { name: "Request restock" }).click();

  // The action's refresh() re-renders the page in the same round trip:
  // pending state appears without any client refetch code.
  await expect(page.getByText("Restock pending…")).toBeVisible();

  // The job completes server-side (~3s); the capped PendingAutoRefresher
  // polls router.refresh() until the server stops rendering it.
  await expect(page.getByText("Restock confirmed.")).toBeVisible({
    timeout: 15_000,
  });
});
