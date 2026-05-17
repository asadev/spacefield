// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("/tasks (unauthenticated)", () => {
  test("loads with a sign-in prompt instead of crashing or 401-ing", async ({
    page,
  }) => {
    const resp = await page.goto("/tasks", {
      waitUntil: "domcontentloaded",
    });
    expect(resp).not.toBeNull();
    // The page is a server component that renders a "Sign in to see
    // tasks" fallback when no auth cookie is present — it must return
    // 2xx (not 401, not 500). Middleware MAY redirect to /signin in
    // certain configurations; accept that as 2xx after redirect too.
    const status = resp!.status();
    expect(status, `unexpected ${status} on /tasks`).toBeLessThan(400);

    // Either the in-page fallback is visible (current behaviour) or
    // the URL has redirected to /signin (middleware fallback). Both
    // are acceptable "you're not signed in" outcomes.
    const url = page.url();
    if (url.includes("/signin")) {
      // Redirected — that's a valid auth gate.
      return;
    }

    // Otherwise, look for the inline fallback markers.
    const promptHeading = page.getByText(/sign in to see tasks/i);
    const cta = page.getByRole("link", { name: /go to sign in/i });
    const promptVisible = await promptHeading
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const ctaVisible = await cta.isVisible().catch(() => false);

    expect(promptVisible || ctaVisible).toBe(true);
  });
});
