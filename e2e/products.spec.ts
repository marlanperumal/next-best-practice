import { expect, test } from "@playwright/test";

test("filters products via URL state", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("listitem")).toHaveCount(5);

  await page.getByRole("combobox").selectOption("audio");
  await expect(page).toHaveURL(/category=audio/);
  await expect(page.getByRole("listitem")).toHaveCount(4);

  await page.getByRole("searchbox").fill("micro");
  await expect(page).toHaveURL(/q=micro/);
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "USB Microphone" })).toBeVisible();
});

test("out-of-range page redirects to the last valid page", async ({ page }) => {
  await page.goto("/products?page=9");
  await expect(page).toHaveURL(/\/products\?page=3$/);
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
});

test("paginates and supports the back button", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Page 2 of 3")).toBeVisible();

  await page.goBack();
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
});

test("tab state lives in the URL and survives reload", async ({ page }) => {
  await page.goto("/products/p1");
  await expect(page.getByText("Closed-back reference headphones.")).toBeVisible();

  await page.getByRole("tab", { name: "reviews" }).click();
  await expect(page).toHaveURL(/tab=reviews/);
  await expect(page.getByText("Flat response, great for mixing.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Flat response, great for mixing.")).toBeVisible();
});

test("unknown product renders the branded not-found page", async ({ page }) => {
  await page.goto("/products/nope");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse products" })).toBeVisible();
});

test("recently viewed is client state persisted across reloads", async ({ page }) => {
  await page.goto("/products/p1");
  await expect(page.getByRole("heading", { name: /Studio Headphones/ })).toBeVisible();

  await page.goto("/products");
  await expect(page.getByRole("complementary")).toContainText("Studio Headphones");

  await page.reload();
  await expect(page.getByRole("complementary")).toContainText("Studio Headphones");
});
