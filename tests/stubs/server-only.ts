/**
 * `server-only` is a Next.js guard package: importing it from a client
 * bundle is meant to fail the build. Under pnpm's isolated node_modules it
 * is not resolvable from the test runner, so unit tests that touch any
 * server module die on import rather than on an assertion.
 *
 * Vitest aliases it to this empty module — the guard has no runtime
 * behaviour to preserve, it only exists to break client bundles.
 */
export {};
