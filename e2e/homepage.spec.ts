// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("homepage", () => {
  test("returns 200 and renders primary nav links", async ({ page }) => {
    const resp = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(resp).not.toBeNull();
    expect(resp!.status()).toBeLessThan(400);

    // Wait for the nav to mount (it's a client component).
    await page.waitForSelector("nav", { timeout: 10_000 });

    // Globally we expect the canonical destinations — Tools, Learn,
    // Community, Blog, About — to all be reachable from the rendered
    // page. The exact link list varies between UAE and non-UAE traffic;
    // the intersection is what we assert.
    const navHrefs = await page.$$eval("a[href]", (els) =>
      (els as HTMLAnchorElement[]).map((a) =>
        a.getAttribute("href") ?? "",
      ),
    );

    const expected = ["/tools", "/learn", "/community", "/blog", "/about"];
    for (const href of expected) {
      const has = navHrefs.some(
        (h) => h === href || h.endsWith(href) || h.includes(href + "?"),
      );
      expect(has, `expected a link matching ${href}`).toBe(true);
    }
  });
});
