import { expect, test } from "@playwright/test";

const A = "http://localhost:3002";
const B = "http://localhost:3003";

// The reason the shared cache handler exists: with the default in-memory
// handler, updateTag on instance A would never reach instance B, and B would
// serve its stale cached entry until cacheLife expiry.
test("updateTag on instance A invalidates instance B's cached entry", async ({
  page,
}) => {
  // Warm the cache for p2's reviews via instance B.
  await page.goto(`${B}/products/p2?tab=reviews`);
  await expect(page.getByText("Clear vocals, some desk noise.")).toBeVisible();

  // Mutate through instance A's UI (Server Action -> updateTag).
  await page.goto(`${A}/products/p2?tab=reviews`);
  await page.getByLabel("Name").fill("Nia");
  await page.getByLabel("Review").fill("Great for podcasts.");
  await page.getByRole("button", { name: "Add review" }).click();
  await expect(page.getByText("Great for podcasts.")).toBeVisible();

  // Instance B picks up the tag invalidation from shared storage
  // (refreshTags runs before each request) and re-fetches.
  await page.goto(`${B}/products/p2?tab=reviews`);
  await expect(page.getByText("Great for podcasts.")).toBeVisible();
});

// Entries — not just tag invalidations — are shared: the cache key is
// derived from the build ID (both instances run the same build), so an
// entry written by instance A is a cache HIT on instance B. Verified via
// the service's hit counters: B's render of a page A already warmed makes
// zero product requests.
test("cache entries written by one instance are served by the other", async ({
  page,
  request,
}) => {
  const readProductHits = async () =>
    ((await (await request.get(`${A}/api/stats`)).json()).product as number) ?? 0;

  // Warm p11's detail on A (writes the getProduct entry to shared storage).
  await page.goto(`${A}/products/p11`);
  await expect(page.getByRole("heading", { name: /Racing Wheel/ })).toBeVisible();

  const before = await readProductHits();
  await page.goto(`${B}/products/p11`);
  await expect(page.getByRole("heading", { name: /Racing Wheel/ })).toBeVisible();
  const after = await readProductHits();

  expect(after - before).toBe(0);
});
