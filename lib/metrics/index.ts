import "server-only";

/**
 * Metrics pipeline — Prometheus-shaped counters and histograms stored
 * in Postgres (public.app_metrics).
 *
 * Goals:
 *   - One-call API: `incr("cache.hit")` / `histogram("queue.depth", 12)`.
 *   - Never block the response path. Every write is fire-and-forget,
 *     wrapped in try/catch, and goes through the service-role client.
 *   - Best-effort batching: rather than firing one INSERT per call,
 *     we coalesce same-tick observations into a tiny in-process buffer
 *     and flush every 2s or at 256 rows, whichever comes first. This
 *     turns the typical "hot path emits 50 cache.hit metrics in one
 *     request" pattern into a single INSERT.
 *
 * Why store metrics in Postgres rather than ship to a Prometheus
 * sidecar:
 *   - We already pay the Supabase connection-pool cost — adding one
 *     more table is cheaper than running another service.
 *   - Retention is handled by /api/cron/log-retention (90 days).
 *   - Aggregates are computed on-read via the metrics_summary RPC;
 *     that's fine at our scale (sub-100k rows/day per metric).
 *
 * Failure semantics:
 *   - The buffer flush silently drops on error (and logs to console).
 *     We do NOT block, retry, or surface metrics-pipeline failures to
 *     the caller — by definition, metrics are best-effort.
 *
 * Cardinality:
 *   - Labels go into a jsonb column; we don't enforce a label schema
 *     here, but callers SHOULD keep label values low-cardinality (no
 *     user ids, no unbounded strings). The supabase indexer can't help
 *     if you push a unique uuid into every row.
 *
 * Edge runtime:
 *   - This lib uses `server-only` and the service-role Supabase client.
 *     It's safe to call from Node runtime route handlers and crons.
 *     Don't import from Edge-runtime middleware; it'll fail at build.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type MetricLabels = Record<string, string | number | boolean | null>;

interface PendingRow {
  ts: string;
  name: string;
  labels: MetricLabels;
  value: number;
}

const BUFFER_MAX = 256;
const FLUSH_INTERVAL_MS = 2_000;

const buffer: PendingRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function scheduleFlush(): void {
  if (flushTimer || flushing) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
  // Allow the Node process to exit even if a flush is pending —
  // we never want metrics to keep a serverless function warm.
  if (typeof flushTimer === "object" && flushTimer && "unref" in flushTimer) {
    (flushTimer as { unref: () => void }).unref();
  }
}

async function flush(): Promise<void> {
  if (flushing) return;
  if (buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, buffer.length);
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_metrics").insert(batch);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[metrics] flush failed:", error.message, {
        dropped: batch.length,
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[metrics] flush threw:",
      (e as Error).message,
      { dropped: batch.length }
    );
  } finally {
    flushing = false;
    // If new metrics arrived while we were flushing, reschedule.
    if (buffer.length > 0) scheduleFlush();
  }
}

function enqueue(row: PendingRow): void {
  buffer.push(row);
  if (buffer.length >= BUFFER_MAX) {
    // Fire an immediate flush; don't wait for the 2s tick.
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flush();
    return;
  }
  scheduleFlush();
}

/**
 * Increment a counter. Use for "this thing happened" events:
 *   incr("cache.hit", { layer: "single-flight" })
 *   incr("api.request", { source: "v1.tasks", status: 200 })
 *
 * Each call records one row with value = 1. Aggregation (rate per
 * minute, total over a window) happens at read time in the
 * metrics_summary RPC.
 */
export function incr(name: string, labels?: MetricLabels): void {
  try {
    enqueue({
      ts: new Date().toISOString(),
      name,
      labels: labels ?? {},
      value: 1,
    });
  } catch (e) {
    // Last-resort defensive catch — enqueue is in-process so should
    // never throw, but we don't want a metrics bug to take down the
    // request that called us.
    // eslint-disable-next-line no-console
    console.error("[metrics] incr failed:", (e as Error).message);
  }
}

/**
 * Record a histogram observation. Use for "this took N units":
 *   histogram("db.query_ms", elapsedMs, { table: "tasks" })
 *   histogram("queue.depth.workflow_runs", count)
 *
 * Aggregation (p50/p95/p99, min/max) happens at read time.
 */
export function histogram(
  name: string,
  value: number,
  labels?: MetricLabels
): void {
  if (!Number.isFinite(value)) return;
  try {
    enqueue({
      ts: new Date().toISOString(),
      name,
      labels: labels ?? {},
      value,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[metrics] histogram failed:", (e as Error).message);
  }
}

/**
 * Force a flush — only used by tests and short-lived scripts where the
 * 2s timer would lose the batch on process exit.
 */
export async function flushMetrics(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
}

/**
 * Diagnostics — current buffer depth. Mainly for tests / health checks.
 */
export function pendingCount(): number {
  return buffer.length;
}

/**
 * Catalogue of metric names we register from inside this codebase.
 * Add an entry here whenever a new metric is emitted so /admin/insights
 * can render a typed catalogue without scraping call sites. The
 * runtime doesn't enforce this — it's documentation that lives next to
 * the call sites instead of in a separate wiki page.
 */
export const METRIC_NAMES = {
  cacheHit: "cache.hit",
  cacheMiss: "cache.miss",
  queueDepthWorkflowRuns: "queue.depth.workflow_runs",
  queueDepthAiBatchJobs: "queue.depth.ai_batch_jobs",
  dbQueryMs: "db.query_ms",
} as const;

export type KnownMetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];
