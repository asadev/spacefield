import "server-only";

/**
 * Workflow + AI-batch backpressure guard.
 *
 * Spacefield has two long-running job systems that both queue work
 * via the same downstream pool (workflow_runs + ai_batch_jobs). When
 * either backlog grows past a healthy threshold, a fresh enqueue
 * request is more likely to time out (or worse, make the runner go
 * over a Vercel function ceiling) than to actually run.
 *
 * Instead of letting the runner crawl, we return a friendly 503-ish
 * "system busy" response from the enqueue path. The caller — a UI
 * form, an API client, or another agent — gets a clear "retry in N
 * seconds" signal rather than an opaque hung response.
 *
 * Thresholds are tunable via runtime_config:
 *   `backpressure.workflow_running_max`   (default 200)
 *   `backpressure.ai_batch_queued_max`    (default 500)
 *   `backpressure.disabled`               (default false — set to
 *                                          true to bypass the guard)
 *
 * The check is intentionally cheap (two count(*) queries; both rely
 * on partial indexes already in place) and resilient — any error
 * inside the guard logs a warning and returns `{ ok: true }` so a
 * downed admin DB doesn't turn into a platform-wide enqueue outage.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getRuntimeConfigBool, getRuntimeConfigNumber } from "@/lib/runtime-config";
import { log } from "@/lib/log";

const DEFAULT_WORKFLOW_RUNNING_MAX = 200;
const DEFAULT_AI_BATCH_QUEUED_MAX = 500;

/** "Try again in N seconds" hint we surface back to the caller. */
const RETRY_AFTER_SECONDS = 30;

export interface BackpressureStatus {
  /** True iff at least one queue is over its configured threshold. */
  busy: boolean;
  /** Workflow runs currently in `running` status. */
  workflow_running: number;
  workflow_running_max: number;
  /** AI batch jobs currently in `queued` status. */
  ai_batch_queued: number;
  ai_batch_queued_max: number;
  retry_after_seconds: number;
  /** Short reason — null when not busy. */
  reason: string | null;
}

const NOT_BUSY = (snap: Omit<BackpressureStatus, "busy" | "reason">): BackpressureStatus => ({
  busy: false,
  reason: null,
  ...snap,
});

/**
 * Read both queue depths. Tolerant of count-RPC failures — returns 0
 * for any branch that errors so a transient DB hiccup doesn't pin
 * every enqueue to "busy".
 */
async function readQueueDepths(): Promise<{
  workflow_running: number;
  ai_batch_queued: number;
}> {
  const admin = createAdminClient();
  try {
    const [wf, batch] = await Promise.all([
      admin
        .from("workflow_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running"),
      admin
        .from("ai_batch_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued"),
    ]);
    return {
      workflow_running: Math.max(0, wf.count ?? 0),
      ai_batch_queued: Math.max(0, batch.count ?? 0),
    };
  } catch (e) {
    log.warn("backpressure.read_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { workflow_running: 0, ai_batch_queued: 0 };
  }
}

/**
 * Single entry point used by the enqueue wrappers below. Returns a
 * structured status — caller decides whether to short-circuit or
 * proceed.
 *
 * Why not throw on busy: enqueue paths are reached from a mix of
 * server actions, route handlers, and direct lib calls. Returning a
 * value keeps the surface uniform and lets each caller pick the
 * response shape that fits their context.
 */
export async function checkBackpressure(): Promise<BackpressureStatus> {
  // Runtime kill switch — set the flag in admin → runtime-config
  // when an op needs to drain backlogs without bouncing new enqueues.
  const disabled = await getRuntimeConfigBool("backpressure.disabled", false);

  const [workflowMax, batchMax] = await Promise.all([
    getRuntimeConfigNumber(
      "backpressure.workflow_running_max",
      DEFAULT_WORKFLOW_RUNNING_MAX
    ),
    getRuntimeConfigNumber(
      "backpressure.ai_batch_queued_max",
      DEFAULT_AI_BATCH_QUEUED_MAX
    ),
  ]);

  const depths = await readQueueDepths();
  const snap = {
    workflow_running: depths.workflow_running,
    workflow_running_max: workflowMax,
    ai_batch_queued: depths.ai_batch_queued,
    ai_batch_queued_max: batchMax,
    retry_after_seconds: RETRY_AFTER_SECONDS,
  };

  if (disabled) {
    return NOT_BUSY(snap);
  }

  const wfOver = workflowMax > 0 && depths.workflow_running >= workflowMax;
  const batchOver = batchMax > 0 && depths.ai_batch_queued >= batchMax;

  if (!wfOver && !batchOver) {
    return NOT_BUSY(snap);
  }

  const reasons: string[] = [];
  if (wfOver) {
    reasons.push(`${depths.workflow_running} workflow runs in progress`);
  }
  if (batchOver) {
    reasons.push(`${depths.ai_batch_queued} AI batch jobs queued`);
  }

  return {
    ...snap,
    busy: true,
    reason: reasons.join("; "),
  };
}

/**
 * Convenience — pass the busy status through to a callable that knows
 * how to surface the response, or proceed when not busy.
 */
export async function withBackpressure<T>(
  onBusy: (status: BackpressureStatus) => T,
  proceed: () => Promise<T>
): Promise<T> {
  const status = await checkBackpressure();
  if (status.busy) return onBusy(status);
  return proceed();
}

/**
 * Format a friendly user-facing message — used by enqueue wrappers
 * that respond with JSON. Kept plain — no markdown — so it reads as
 * both an SSE delta and a toast string.
 */
export function busyMessageFor(status: BackpressureStatus): string {
  return (
    "The system is busy right now. Please try again in about " +
    `${status.retry_after_seconds} seconds.`
  );
}
