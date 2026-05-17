// @ts-nocheck
/**
 * Vitest config — gated.
 *
 * Vitest is NOT a project dependency. This file only activates if a
 * developer (or CI job) installs vitest explicitly:
 *
 *   pnpm add -D vitest @vitest/coverage-v8
 *
 * The `// @ts-nocheck` keeps `npx tsc --noEmit` clean even when the
 * `vitest/config` types aren't present in node_modules. At test-run
 * time, Vitest reads this file with its own TS pipeline and ignores
 * the directive.
 *
 * Why ts-nocheck instead of an `exclude` in tsconfig: this file lives
 * at the repo root and the parent tsconfig matches `**\/*.ts`. Adding
 * a root-level exclusion would require editing tsconfig.json, which
 * is out of scope for this agent and risks breaking other tooling.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Only run files under tests/** so we don't accidentally pick up
    // *.test.ts files that belong to next/jest scaffolding in other
    // packages.
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    // Pure-Node environment; the helpers under test are isomorphic but
    // none need a DOM. The locale/format helpers do a `typeof document`
    // check that returns null on the server path — that's exactly what
    // we exercise.
    environment: "node",
    globals: false,
    // Keep CI runs predictable.
    reporters: ["default"],
    // The same alias the app uses so `@/lib/...` resolves.
    alias: {
      "@": path.resolve(__dirname, "."),
    },
    // Don't fail the run on missing coverage; coverage is opt-in.
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.d.ts", "tests/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
