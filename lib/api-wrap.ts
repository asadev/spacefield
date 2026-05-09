import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { logError } from "@/lib/error-log";
import { checkAndIncrement, getClientIp } from "@/lib/rate-limit";
import type { RateLimitRuleRow } from "@/app/admin/_types";

/**
 * Wrapper for Next.js route handlers (Node runtime, not middleware).
 *
 * Centralises the cross-cutting concerns we previously copy-pasted:
 *   1. assertAdmin() if `requireAdmin` is set.
 *   2. ad-hoc rate-limit using `rateLimit` opts (no DB rule lookup —
 *      the caller declares its own count + window inline). Buckets are
 *      keyed by user id when available, otherwise by client IP.
 *   3. error logging via lib/error-log.ts with the supplied source.
 *
 * The wrapper preserves Next.js's GET/POST/etc. handler signature so
 * route files can drop it in without restructuring.
 */

export interface ApiWrapOpts {
  /** Throw 401/403 unless the caller is an admin. */
  requireAdmin?: boolean;
  /**
   * Inline rate-limit. When set, we increment a bucket keyed by
   * `${userId|ip}:${source}` and return 429 if the count exceeds
   * `count` in the rolling `window_sec` window.
   */
  rateLimit?: {
    count: number;
    window_sec: number;
  };
  /** Source tag — used for error_events.source AND the rate-limit key. */
  source: string;
}

export type ApiHandler<Ctx = unknown> = (
  req: NextRequest,
  ctx: Ctx
) => Promise<Response> | Response;

/**
 * Wrap a route handler. Returns a function with the same signature so
 * it can be re-exported as `GET`/`POST`/etc. directly.
 *
 * Usage:
 *   export const GET = withApiHandler(handler, {
 *     requireAdmin: true,
 *     source: "admin.alerts.list",
 *     rateLimit: { count: 60, window_sec: 60 },
 *   });
 */
export function withApiHandler<Ctx = unknown>(
  handler: ApiHandler<Ctx>,
  opts: ApiWrapOpts
): ApiHandler<Ctx> {
  return async (req, ctx) => {
    let userId: string | null = null;

    // 1. Admin gate.
    if (opts.requireAdmin) {
      try {
        const auth = await assertAdmin();
        userId = auth.userId;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "forbidden";
        const status = message === "not signed in" ? 401 : 403;
        return NextResponse.json({ error: message }, { status });
      }
    }

    // 2. Rate-limit (declared inline by the caller). We synthesise a
    //    minimal RateLimitRuleRow so we can reuse the same bucket
    //    machinery as the admin-defined rules in middleware.
    if (opts.rateLimit) {
      try {
        const ip = getClientIp(req);
        const key = `${userId ?? ip}:${opts.source}`;
        const syntheticRule: RateLimitRuleRow = {
          id: `apiwrap:${opts.source}`,
          scope: "route",
          scope_value: null,
          route_pattern: opts.source,
          limit_count: opts.rateLimit.count,
          window_sec: opts.rateLimit.window_sec,
          burst_count: null,
          enabled: true,
          metadata: {},
          created_at: "",
          updated_at: "",
        };
        const decision = await checkAndIncrement(syntheticRule, key);
        if (!decision.allowed) {
          const retryAfter = Math.max(
            1,
            Math.ceil(
              (decision.reset_at.getTime() - Date.now()) / 1000
            )
          );
          return NextResponse.json(
            { error: "rate_limited" },
            {
              status: 429,
              headers: { "Retry-After": String(retryAfter) },
            }
          );
        }
      } catch (err) {
        // Fail-open on rate-limit infra failure but log the cause.
        await logError({
          source: opts.source,
          message:
            err instanceof Error
              ? `rate-limit infra failure: ${err.message}`
              : "rate-limit infra failure",
          stack: err instanceof Error ? err.stack ?? null : null,
          url: req.nextUrl.toString(),
          level: "warning",
        });
      }
    }

    // 3. Run the handler with full error logging. Anything thrown is
    //    captured into error_events with the supplied source, then
    //    surfaced as a 500 JSON body.
    try {
      return await handler(req, ctx);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      await logError({
        source: opts.source,
        message: e.message,
        stack: e.stack ?? null,
        url: req.nextUrl.toString(),
        user_id: userId,
        user_agent: req.headers.get("user-agent") ?? null,
        level: "error",
      });
      return NextResponse.json(
        { error: e.message || "internal_error" },
        { status: 500 }
      );
    }
  };
}
