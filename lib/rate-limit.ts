import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

import type {
  RateLimitRuleRow,
  RateLimitScope,
} from "@/app/admin/_types";

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

/* ────────────── v4 admin-defined rules + in-memory bucket ────────────── */

/**
 * Admin-managed rate-limit rules live in `rate_limit_rules`. The helpers
 * below let middleware / route handlers query the rule set and enforce
 * a check + increment without writing the SQL inline.
 *
 * NOTE — the `checkAndIncrement` bucket is process-local (Map). For
 * production we expect the actual store to move to Redis or a Postgres
 * RPC; this implementation is correct for a single-process deploy and
 * acceptable as a stop-gap on Vercel where each lambda has its own RAM.
 */

type RuleCacheEntry = {
  rules: RateLimitRuleRow[];
  expiresAt: number;
};

const RULE_TTL_MS = 60_000;
const ruleCache = new Map<string, RuleCacheEntry>();

function ruleCacheKey(
  scope: RateLimitScope,
  value?: string,
  route?: string
): string {
  return `${scope}::${value ?? ""}::${route ?? ""}`;
}

/**
 * Fetch enabled rules for the requested scope. Cached for 60s in-process.
 *
 * - `scope = 'global'`           → all global rules
 * - `scope = 'tier'`             → rules where scope_value = `value`
 * - `scope = 'user'|'workspace'` → rules where scope_value = `value`
 * - `scope = 'route'`            → rules whose route_pattern matches `route`
 *                                  (exact match OR a `*`-glob substring)
 */
export async function getApplicableRules(
  scope: RateLimitScope,
  value?: string,
  route?: string
): Promise<RateLimitRuleRow[]> {
  const key = ruleCacheKey(scope, value, route);
  const cached = ruleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rules;
  }
  try {
    const supabase = createAdminClient();
    let q = supabase
      .from("rate_limit_rules")
      .select("*")
      .eq("scope", scope)
      .eq("enabled", true);
    if (
      (scope === "tier" || scope === "user" || scope === "workspace") &&
      value
    ) {
      q = q.eq("scope_value", value);
    }
    const { data, error } = await q;
    if (error) {
      ruleCache.set(key, { rules: [], expiresAt: Date.now() + RULE_TTL_MS });
      return [];
    }
    const rows = (data ?? []) as RateLimitRuleRow[];
    let rules = rows;
    if (scope === "route" && route) {
      rules = rows.filter((r) => routeMatches(r.route_pattern, route));
    }
    ruleCache.set(key, { rules, expiresAt: Date.now() + RULE_TTL_MS });
    return rules;
  } catch {
    return [];
  }
}

/**
 * Glob match for route patterns. `*` is treated as a wildcard, anchored
 * to the start of the path. Empty pattern → no match.
 */
function routeMatches(pattern: string | null, route: string): boolean {
  if (!pattern) return false;
  if (pattern === route) return true;
  // Convert glob to regex: only `*` is special.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
  return regex.test(route);
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  reset_at: Date;
}

/**
 * Increment the bucket for `(rule.id, key)` and return the decision.
 *
 * IMPORTANT — the bucket store is in-memory and per-process. For
 * production scale move to Redis (e.g. `INCR` + `EXPIRE`). This is good
 * enough for low-traffic admin endpoints and serverless deploys with
 * sticky-enough routing.
 */
export async function checkAndIncrement(
  rule: RateLimitRuleRow,
  key: string
): Promise<RateLimitDecision> {
  const now = Date.now();
  const windowMs = Math.max(1, rule.window_sec) * 1000;
  const max = Math.max(1, rule.limit_count);
  const bucketKey = `${rule.id}::${key}`;

  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }
  bucket.count += 1;
  buckets.set(bucketKey, bucket);

  // Lazy cleanup: every ~256 inserts, prune expired buckets.
  if (buckets.size > 256 && Math.random() < 0.05) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const allowed = bucket.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - bucket.count),
    reset_at: new Date(bucket.resetAt),
  };
}

/** Test-only: reset the in-process bucket store. Not exported via index. */
export function __resetRateLimitBuckets(): void {
  buckets.clear();
  ruleCache.clear();
}
