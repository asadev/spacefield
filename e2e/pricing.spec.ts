// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("/pricing", () => {
  test("loads and shows the currency switcher", async ({ page }) => {
    const resp = await page.goto("/pricing", {
      waitUntil: "domcontentloaded",
    });
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBeLessThan(400);

    // The page has an `h1` containing "Pricing" — sanity check.
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible({ timeout: 10_000 });

    // CurrencySwitcher renders a native <select aria-label="Display
    // currency">. The mobile copy is hidden via `hidden sm:inline-flex`
    // but the markup is still in the DOM, so a single locator covers
    // both viewports.
    const switcher = page.locator('select[aria-label="Display currency"]');
    await expect(switcher).toHaveCount(1, { timeout: 10_000 });

    // The switcher should have more than one option (AED + at least
    // one alt — otherwise the dropdown is useless).
    const optionCount = await switcher.locator("option").count();
    expect(optionCount).toBeGreaterThan(1);
  });
});
