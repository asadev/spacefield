import "server-only";

/**
 * Per-request DB query timing helper.
 *
 * We deliberately do NOT modify lib/api-wrap.ts — that file is the
 * authoritative cross-cutting wrapper and changes to it ripple across
 * every API route. Instead we expose a tiny in-handler helper that any
 * route can wrap around a Supabase query (or any async DB op) and
 * record the elapsed time into the metrics histogram.
 *
 * Why per-handler:
 *   - The wrapper-level latency we already record (api_latency) is
 *     end-to-end and includes auth, parsing, JSON serialisation, etc.
 *     The query-time metric isolates the DB hop, which is what we
 *     actually need to spot a slow query vs a slow handler.
 *
 * Usage:
 *   const { data, error } = await timeQuery(
 *     "tasks.list",
 *     () => admin.from("tasks").select(...),
 *     { source: "v1.tasks" }
 *   );
 *
 *   if (error) ... // handle as usual
 *
 * The helper is intentionally generic so it works equally well for
 * `.rpc(...)`, `.from(...).select(...)`, raw fetches, or anything else
 * that returns a promise.
 *
 * Failure semantics:
 *   - We always emit a histogram observation, including on producer
 *     error. The metric's `status` label distinguishes "ok" from
 *     "error" so a slow-and-broken query is still visible.
 *   - We never swallow the producer's error or its return value —
 *     the helper is transparent to the caller.
 */

import { histogram, METRIC_NAMES, type MetricLabels } from "@/lib/metrics";

export interface QueryTimingOpts {
  /** Source tag (typically the api-wrap source for the route). */
  source: string;
  /** Optional extra labels (workspace_id, etc.). Keep them low-cardinality. */
  labels?: MetricLabels;
}

/**
 * Wrap a DB call so its elapsed time is recorded in the metrics
 * pipeline. Returns whatever the producer returns (including supabase
 * `{ data, error }` envelopes — we don't unwrap).
 */
export async function timeQuery<T>(
  queryName: string,
  producer: () => Promise<T>,
  opts: QueryTimingOpts
): Promise<T> {
  const started = Date.now();
  let status: "ok" | "error" = "ok";
  try {
    const result = await producer();
    // Detect supabase-style { data, error } envelopes. We don't change
    // behaviour — we only label the metric so dashboards can split
    // "ok" from "error" without joining tables.
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      (result as { error: unknown }).error
    ) {
      status = "error";
    }
    return result;
  } catch (e) {
    status = "error";
    throw e;
  } finally {
    const ms = Date.now() - started;
    histogram(METRIC_NAMES.dbQueryMs, ms, {
      query: queryName,
      source: opts.source,
      status,
      ...(opts.labels ?? {}),
    });
  }
}
