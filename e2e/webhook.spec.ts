import { expect, test } from "@playwright/test";

const SECRET = { "x-revalidate-secret": "dev-webhook-secret" };

test("backend-originated write becomes visible via webhook revalidation", async ({
  page,
  request,
}) => {
  // Warm the cache with the current price.
  await page.goto("/products/p6");
  await expect(page.getByText("$159")).toBeVisible();

  // The backend mutates the external service directly — the app never saw
  // this write, so its cache is now stale...
  await request.patch("/api/products/p6", { data: { price: 179 } });
  await page.reload();
  await expect(page.getByText("$159")).toBeVisible();

  // ...until the backend calls the app's webhook. Revalidation from a route
  // handler can apply just after the response, so poll the reload.
  const ok = await request.post("/webhooks/revalidate", {
    data: { tag: "products" },
    headers: SECRET,
  });
  expect(ok.ok()).toBeTruthy();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("$179")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });

  // Wrong secret is rejected.
  const bad = await request.post("/webhooks/revalidate", {
    data: { tag: "products" },
    headers: { "x-revalidate-secret": "wrong" },
  });
  expect(bad.status()).toBe(401);

  // Restore the seed price for other tests.
  await request.patch("/api/products/p6", { data: { price: 159 } });
  await request.post("/webhooks/revalidate", {
    data: { tag: "products" },
    headers: SECRET,
  });
});
