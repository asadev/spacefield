// @ts-nocheck
/**
 * Unit tests for lib/safe-error.ts.
 *
 * Two mocks are needed:
 *
 *   1. `server-only` — Next ships a stub that throws "cannot be
 *      imported from a Client Component". Test runners are neither,
 *      so we replace it with a noop.
 *
 *   2. `@/lib/error-log` — the helper fire-and-forgets `logError`. We
 *      stub it out to capture calls and assert the redaction path
 *      doesn't lose context.
 *
 * Both VERCEL_ENV and NODE_ENV are mutated around each test; we
 * snapshot them in `beforeEach` and restore in `afterEach` so we
 * don't leak state to neighbouring tests in the same worker.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

vi.mock("server-only", () => ({}));

const logCalls: Array<Record<string, unknown>> = [];
vi.mock("@/lib/error-log", () => ({
  logError: vi.fn(async (entry: Record<string, unknown>) => {
    logCalls.push(entry);
  }),
}));

// Import AFTER the mocks so the helper sees them.
const { safeErrorMessage } = await import("@/lib/safe-error");

describe("safeErrorMessage", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    logCalls.length = 0;
  });

  afterEach(() => {
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns the raw message in development", () => {
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    const out = safeErrorMessage(new Error("duplicate key value violates unique constraint"));
    expect(out).toContain("duplicate key");
  });

  it("returns the raw message in Vercel preview", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = "production";
    const out = safeErrorMessage(new Error("raw schema details"));
    expect(out).toBe("raw schema details");
  });

  it("redacts to the default fallback in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    const out = safeErrorMessage(new Error("secret schema detail leaked"));
    expect(out).toBe("internal_error");
    expect(out).not.toContain("secret");
  });

  it("honours a custom fallback in production", () => {
    process.env.VERCEL_ENV = "production";
    const out = safeErrorMessage(new Error("boom"), {
      fallback: "create_failed",
    });
    expect(out).toBe("create_failed");
  });

  it("respects NODE_ENV=production when VERCEL_ENV is unset (self-hosted prod)", () => {
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "production";
    const out = safeErrorMessage(new Error("leak"));
    expect(out).toBe("internal_error");
  });

  it("logs every error via logError regardless of environment", async () => {
    process.env.VERCEL_ENV = "production";
    safeErrorMessage(new Error("logged-1"), { source: "test.case", userId: "u_1" });
    // logError is fire-and-forget; wait a microtask for the catch handler.
    await Promise.resolve();
    expect(logCalls.length).toBe(1);
    expect(logCalls[0].source).toBe("test.case");
    expect(logCalls[0].user_id).toBe("u_1");
    expect(logCalls[0].message).toContain("logged-1");
  });

  it("handles non-Error throwables (strings, undefined)", () => {
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    expect(safeErrorMessage("just a string")).toBe("just a string");
    // undefined → empty message in dev, helper still returns fallback.
    const out = safeErrorMessage(undefined, { fallback: "missing" });
    expect(out).toBe("missing");
  });
});
