import { NextResponse, type NextRequest } from "next/server";

import { recordAdminAction } from "@/app/admin/_audit";
import { assertAdmin } from "@/app/admin/_lib";
import { runWorkflow } from "@/lib/workflow-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/workflows/[id]/run
 *
 * Body: { input?: Record<string, unknown>, trigger_kind?: 'manual'|'event'|'cron' }
 *
 * Manually triggers a workflow execution. Inserts a `workflow_runs` row,
 * walks each step, records the result, and returns a summary.
 *
 * Audit: `workflow.run` with the run_id + summary stats.
 */

interface RunBody {
  input?: unknown;
  trigger_kind?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const { id: rawId } = await params;
  const workflowId = decodeURIComponent(rawId).trim();
  if (!workflowId) {
    return NextResponse.json(
      { ok: false, error: "missing workflow id" },
      { status: 400 }
    );
  }

  let body: RunBody = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text) as RunBody;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? (body.input as Record<string, unknown>)
      : {};

  const triggerKind: "manual" | "event" | "cron" =
    body.trigger_kind === "event" || body.trigger_kind === "cron"
      ? body.trigger_kind
      : "manual";

  const result = await runWorkflow({
    workflow_id: workflowId,
    input,
    triggered_by: auth.userId,
    trigger_kind: triggerKind,
  });

  try {
    await recordAdminAction({
      action: "workflow.run",
      targetType: "agent_workflow",
      targetId: workflowId,
      after: {
        run_id: result.run_id,
        ok: result.ok,
        steps: result.results.length,
        duration_ms: result.duration_ms,
        error: result.error ?? null,
      },
      metadata: {
        workflow_id: workflowId,
        trigger_kind: triggerKind,
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json(result);
}
