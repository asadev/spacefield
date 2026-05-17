// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("GET /api/health", () => {
  test("returns expected JSON shape", async ({ request }) => {
    const resp = await request.get("/api/health");
    // The endpoint returns 200 when all probes pass, 503 if any fail.
    // Both shapes are valid; the smoke check is "the route exists and
    // returns the documented body" — which means the surrounding
    // framework/middleware is healthy even if e.g. Supabase is down.
    expect([200, 503]).toContain(resp.status());

    const body = await resp.json();
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();

    // SD-007 — minimal body: { ok, status, checked_at, probes }
    expect(typeof body.ok).toBe("boolean");
    expect(["healthy", "degraded"]).toContain(body.status);
    expect(typeof body.checked_at).toBe("string");
    expect(Array.isArray(body.probes)).toBe(true);

    for (const probe of body.probes) {
      expect(typeof probe.name).toBe("string");
      expect(typeof probe.ok).toBe("boolean");
      expect(typeof probe.ms).toBe("number");
      // Without ?deep=1, probe.detail must NOT be present.
      expect(probe).not.toHaveProperty("detail");
    }

    // Without authenticated deep mode, the response must not leak
    // commit SHA or region.
    expect(body).not.toHaveProperty("commit");
    expect(body).not.toHaveProperty("region");

    // Response must explicitly opt out of caching.
    expect(resp.headers()["cache-control"]).toContain("no-store");
  });
});
