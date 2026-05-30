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
 * something we can't fix.
 *
 * SD-007 — Previously this endpoint exposed:
 *   - `commit` (full deploy SHA → fingerprints the running build for
 *     attackers trying to time-window a known CVE).
 *   - `region` (deploy region → not actively dangerous but unnecessary
 *     surface; we now scope it behind `?deep=1`).
 *   - `probes[].detail` (raw error strings from Supabase / fetch —
 *     could leak internal hostnames, schema names, etc).
 *
 * The body is now minimal by default:
 *   { ok, status, checked_at, probes: [{ name, ok, ms }] }
 *
 * `?deep=1` + `Authorization: Bearer <HEALTH_DEEP_TOKEN>` (or the
 * fallback `CRON_SECRET` which we already gate cron triggers with)
 * unlocks the operator-grade view including `commit`, `region`, and
 * `probes[].detail`. If neither env var is set, deep mode is disabled.
 */

import { NextResponse, type NextRequest } from "next/server";

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
    // Hit the Supabase Auth (GoTrue) liveness endpoint. It returns a
    // deterministic 200 ("GoTrue is healthy") to a request carrying the anon
    // key. The PostgREST root (/rest/v1/) replies 401 ("No API key found") to a
    // bare anon request, which made this liveness probe report a persistent
    // false 503 and broke every uptime monitor pointed at /api/health.
    const res = await fetch(`${url}/auth/v1/health`, {
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

/** SD-007 — deep mode is opt-in + token-gated. */
function isDeepAllowed(req: NextRequest): boolean {
  const wantsDeep = req.nextUrl.searchParams.get("deep") === "1";
  if (!wantsDeep) return false;
  const expected =
    process.env.HEALTH_DEEP_TOKEN || process.env.CRON_SECRET || "";
  if (!expected) return false;
  // Accept the token via either Authorization: Bearer or a `token` query
  // param so curl-from-monitor works in either shape.
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const queryToken = req.nextUrl.searchParams.get("token") ?? "";
  return safeEq(bearer, expected) || safeEq(queryToken, expected);
}

/** Constant-time-ish string compare — short-circuit on length so we
 * don't leak it via timing. */
function safeEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const probes = await Promise.all([probeSupabase()]);
  const ok = probes.every((p) => p.ok);
  const deep = isDeepAllowed(req);

  // Strip `detail` from probes unless we're in authenticated deep mode.
  const safeProbes = deep
    ? probes
    : probes.map(({ name, ok: pOk, ms }) => ({ name, ok: pOk, ms }));

  const body: Record<string, unknown> = {
    ok,
    status: ok ? "healthy" : "degraded",
    checked_at: new Date().toISOString(),
    probes: safeProbes,
  };
  if (deep) {
    body.commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
    body.region = process.env.VERCEL_REGION ?? null;
  }

  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, must-revalidate",
      "Content-Type": "application/json",
    },
  });
}
