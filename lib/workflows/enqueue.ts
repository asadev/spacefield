import "server-only";

/**
 * Workflow enqueue wrapper.
 *
 * `lib/workflow-runner.ts` exports `runWorkflow()` — the actual
 * dispatcher. It runs synchronously inside the calling request.
 * This module sits in front of it and applies the backpressure
 * guard (lib/workflows/backpressure.ts) so the system stays
 * responsive when the workflow_runs / ai_batch_jobs backlog gets
 * deep.
 *
 * Callers that previously did:
 *   const r = await runWorkflow({ workflow_id, ... });
 *
 * Now do:
 *   const r = await enqueueWorkflow({ workflow_id, ... });
 *   if (r.busy) return NextResponse.json({...}, { status: 503 });
 *
 * Or use `runWorkflowOrBusy()` when they want a single result type.
 */

import { runWorkflow, type RunWorkflowOptions, type RunWorkflowResult } from "@/lib/workflow-runner";

import {
  busyMessageFor,
  checkBackpressure,
  type BackpressureStatus,
} from "./backpressure";

export interface EnqueueWorkflowBusy {
  busy: true;
  status: BackpressureStatus;
  message: string;
  retry_after_seconds: number;
}

export interface EnqueueWorkflowOk {
  busy: false;
  result: RunWorkflowResult;
}

export type EnqueueWorkflowResult = EnqueueWorkflowBusy | EnqueueWorkflowOk;

export async function enqueueWorkflow(
  opts: RunWorkflowOptions
): Promise<EnqueueWorkflowResult> {
  const status = await checkBackpressure();
  if (status.busy) {
    return {
      busy: true,
      status,
      message: busyMessageFor(status),
      retry_after_seconds: status.retry_after_seconds,
    };
  }
  const result = await runWorkflow(opts);
  return { busy: false, result };
}

/**
 * Convenience variant — collapses busy into the standard
 * `RunWorkflowResult` shape with `ok=false, error='system_busy'`.
 * Use this from call sites that don't want to teach two response
 * shapes to their downstream UI.
 */
export async function runWorkflowOrBusy(
  opts: RunWorkflowOptions
): Promise<RunWorkflowResult & { busy?: true }> {
  const enq = await enqueueWorkflow(opts);
  if (enq.busy) {
    return {
      ok: false,
      busy: true,
      run_id: "",
      results: [],
      duration_ms: 0,
      error: enq.message,
    };
  }
  return enq.result;
}
