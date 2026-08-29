import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // `@/…` is the app's own path alias, mirrored from tsconfig.
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // See tests/stubs/server-only.ts for why this is aliased away.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
