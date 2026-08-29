import { fileURLToPath } from "node:url";

/**
 * Deliberately .mjs, not .ts.
 *
 * vitest is installed per-job in CI rather than committed to the lockfile,
 * so a TypeScript config here would import `vitest/config` — and the Next
 * build, which type-checks every .ts file in the project, would fail on a
 * module it has no reason to install.
 */
export default {
  resolve: {
    alias: {
      // mirrors the "@/*" path alias in tsconfig.json
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // see tests/stubs/server-only.ts for why this is aliased away
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
};
