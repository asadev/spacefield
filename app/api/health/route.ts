/**
 * GET /api/health — public health probe.
 *
 * Returns 200 only when:
 *   1. The Supabase REST endpoint replies to a trivial RPC ping.
 *   2. The basic env vars required for the app are present.
 *
 * Designed for:
 *   - Synthetic monitors (Better Stack, Checkly, Pingdom).
 *   - Public uptime page polling (status.spacefield.co).
 *   - Vercel deployment health checks.
 *
 * Response shape is intentionally small (sub-1KB) so it's cheap to poll
 * every 30-60s. We DO NOT call the AI provider here — that would burn
 * tokens on every monitor hit and a provider blip would page us about
 * something we can't fix. Add `?deep=1` later if we want a deep check.
 *
 * The endpoint is cache-busted (no-store) so a stale CDN copy can't hide
 * a real outage from monitors.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Probe = { name: string; ok: boolean; ms: number; detail?: string };

async function probeSupabase(): Promise<Probe> {
  const start = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return {
      name: "supabase",
      ok: false,
      ms: Date.now() - start,
      detail: "env vars missing",
    };
  }
  try {
    // Lightweight: hit the REST root. Supabase returns OpenAPI JSON on
    // success — we don't care about the body, just the status code.
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      // Short timeout via AbortController for monitor SLAs
      signal: AbortSignal.timeout(3000),
    });
    return {
      name: "supabase",
      ok: res.ok,
      ms: Date.now() - start,
      detail: res.ok ? undefined : `http ${res.status}`,
    };
  } catch (err) {
    return {
      name: "supabase",
      ok: false,
      ms: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const probes = await Promise.all([probeSupabase()]);
  const ok = probes.every((p) => p.ok);
  const body = {
    ok,
    status: ok ? "healthy" : "degraded",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    region: process.env.VERCEL_REGION ?? null,
    checked_at: new Date().toISOString(),
    probes,
  };
  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
      "Content-Type": "application/json",
    },
  });
}
