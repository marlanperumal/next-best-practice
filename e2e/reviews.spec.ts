import { expect, test } from "@playwright/test";

test("adding a review appears in the action's own response (updateTag)", async ({
  page,
}) => {
  await page.goto("/products/p5?tab=reviews");
  await expect(page.getByText("Stunning picture in a small room.")).toBeVisible();

  await page.getByLabel("Name").fill("Zoe");
  await page.getByLabel("Rating").selectOption("4");
  await page.getByLabel("Review").fill("Bright enough for daytime.");
  await page.getByRole("button", { name: "Add review" }).click();

  // No reload, no client refetch: the server action invalidated the tag and
  // the refreshed review list came back with the action response.
  await expect(page.getByText("Bright enough for daytime.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Review added");

  // And it truly persisted on the external service.
  await page.reload();
  await expect(page.getByText("Bright enough for daytime.")).toBeVisible();
});

test("helpful vote is optimistic and converges to the server value", async ({
  page,
}) => {
  await page.goto("/products/p1?tab=reviews");
  const button = page
    .getByRole("listitem")
    .filter({ hasText: "Flat response" })
    .getByRole("button");

  const label = await button.textContent();
  const count = Number(/\((\d+)\)/.exec(label ?? "")?.[1]);

  await button.click();
  // Optimistic bump before the 400ms round trip completes.
  await expect(button).toHaveText(`Helpful (${count + 1})`);

  // Canonical value after updateTag refresh + hard reload agrees.
  await expect(button).toBeEnabled();
  await page.reload();
  await expect(button).toHaveText(`Helpful (${count + 1})`);
});
