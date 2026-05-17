// @ts-nocheck
/**
 * Playwright smoke-pack config — gated.
 *
 * Playwright is NOT a project dependency to keep the install small.
 * Install it locally before running:
 *
 *   pnpm add -D @playwright/test
 *   pnpm exec playwright install --with-deps chromium
 *   pnpm test:e2e
 *
 * The runner reads PLAYWRIGHT_BASE_URL from the environment:
 *
 *   - unset  → starts `pnpm dev` on http://localhost:3000 via webServer.
 *   - set    → assumes the URL is already serving (e.g. a Vercel preview
 *     deploy URL passed in from CI) and skips webServer.
 *
 * Tests live under e2e/**. They're intentionally non-destructive: no
 * sign-in flow, no DB writes — they hit public routes and the health
 * probe, which is what we'd want a deploy smoke-check to do anyway.
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const usingExternalServer = !!process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // Each spec is a smoke check — keep them snappy.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Only spin up `pnpm dev` when the caller hasn't pointed us at a
  // deployed URL. The 120s startup ceiling is generous because Next's
  // first compile of /pricing on a cold worktree can hit ~45s.
  webServer: usingExternalServer
    ? undefined
    : {
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
