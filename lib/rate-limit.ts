import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Postgres-backed rate limiter. State lives in `public.rate_limit_buckets`;
 * the SECURITY DEFINER RPC `rate_limit_check` does the atomic increment
 * and window roll-over.
 *
 * Fail-open: if the RPC errors (network blip, migration not yet applied,
 * etc.) we let the request through. Better to allow a few extra requests
 * than break the app over a dependency we can't always reach.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("rate_limit_check", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data === true || data === null || data === undefined;
  } catch {
    return true;
  }
}

/**
 * Best-effort client IP extraction. Vercel sets `x-forwarded-for` with
 * the originating IP first. Falls back to "unknown" so callers can still
 * key on something deterministic.
 */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Convenience wrapper: returns a 429 response if the limit is exceeded,
 * else null. Callers do `const r = await enforceRateLimit(...); if (r) return r;`
 */
export async function enforceRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const allowed = await checkRateLimit(key, max, windowSeconds);
  if (allowed) return null;
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(windowSeconds) },
    }
  );
}
