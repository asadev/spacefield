// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("/signin", () => {
  test("renders the sign-in dialog", async ({ page }) => {
    const resp = await page.goto("/signin", {
      waitUntil: "domcontentloaded",
    });
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBeLessThan(400);

    // The page mounts SignInDialog with `open=true` on render. The
    // dialog should expose an email input + a submit-ish button. We
    // match by visible role rather than a brittle DOM selector so the
    // test survives layout refactors.
    //
    // Reduced motion request makes Framer Motion finish enter-anim
    // immediately rather than animating in over ~300ms.
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Wait for either an email input or a heading mentioning sign-in.
    const emailInput = page
      .locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i]',
      )
      .first();
    const heading = page.getByText(/sign in|sign-in|continue|email/i).first();

    await Promise.race([
      emailInput.waitFor({ state: "visible", timeout: 10_000 }),
      heading.waitFor({ state: "visible", timeout: 10_000 }),
    ]);

    // Confirm at least one of the markers is in the DOM after the race.
    const emailVisible = await emailInput.isVisible().catch(() => false);
    const headingVisible = await heading.isVisible().catch(() => false);
    expect(emailVisible || headingVisible).toBe(true);
  });
});
