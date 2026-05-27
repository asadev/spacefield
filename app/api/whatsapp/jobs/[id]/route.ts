import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/whatsapp/jobs/[id]
 *
 * Body: { workspace_id?: string, action: 'pause' | 'resume' | 'cancel' }
 *
 * Action → status transition (server-side state machine):
 *   pause   → running         → paused
 *   resume  → paused | queued → queued     (cron runner picks up)
 *   cancel  → !terminal       → cancelled
 *
 * Workspace membership is verified explicitly via the route helper —
 * we read workspace_id either from the body (preferred) or by joining
 * back through whatsapp_send_jobs.workspace_id when the body omits it
 * so the UI doesn't have to thread workspace_id everywhere.
 *
 * Response shape: `{ item: WaJob }` — the patched row.
 */

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
]);

type Action = "pause" | "resume" | "cancel";

function nextStatusFor(
  current: string,
  action: Action,
): { ok: true; next: string } | { ok: false; reason: string } {
  if (TERMINAL_STATUSES.has(current)) {
    return { ok: false, reason: `job_${current}_cannot_${action}` };
  }
  if (action === "pause") {
    if (current !== "running" && current !== "queued") {
      return { ok: false, reason: `job_${current}_cannot_pause` };
    }
    return { ok: true, next: "paused" };
  }
  if (action === "resume") {
    if (current !== "paused") {
      return { ok: false, reason: `job_${current}_cannot_resume` };
    }
    return { ok: true, next: "queued" };
  }
  // cancel — any non-terminal status can be cancelled.
  return { ok: true, next: "cancelled" };
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id: jobId } = await ctx.params;
  if (!jobId) return jsonError("id required", 400);

  const body = await readJson<{ workspace_id?: string; action?: Action }>(req);
  if (!body.ok) return body.response;

  const action = body.body.action;
  if (action !== "pause" && action !== "resume" && action !== "cancel") {
    return jsonError("action must be 'pause'|'resume'|'cancel'", 400);
  }

  const admin = createAdminClient();
  const { data: jobRow, error: jobErr } = await admin
    .from("whatsapp_send_jobs")
    .select("id, workspace_id, status, started_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) return jsonError(jobErr.message, 500);
  if (!jobRow) return jsonError("not_found", 404);

  const job = jobRow as {
    id: string;
    workspace_id: string;
    status: string;
    started_at: string | null;
  };
  const workspaceId = body.body.workspace_id ?? job.workspace_id;
  if (workspaceId !== job.workspace_id) {
    // Caller asserted a different workspace than the job belongs to — treat
    // as a 403 so we don't leak the actual owner workspace id.
    return jsonError("forbidden", 403);
  }

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const transition = nextStatusFor(job.status, action);
  if (!transition.ok) {
    return NextResponse.json(
      { error: "invalid_transition", reason: transition.reason },
      { status: 409 },
    );
  }

  const patch: Record<string, unknown> = { status: transition.next };
  if (transition.next === "cancelled") {
    patch.completed_at = new Date().toISOString();
  }
  if (transition.next === "queued" && !job.started_at) {
    // Resume from never-started — leave started_at unset; the runner sets it.
  }

  const { data: updated, error: updErr } = await admin
    .from("whatsapp_send_jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .select(
      "id, target_type, target_id, status, total_contacts, sent_count, failed_count, error_message, started_at, completed_at, created_at",
    )
    .maybeSingle();
  if (updErr) return jsonError(updErr.message, 500);
  if (!updated) return jsonError("not_found", 404);

  return NextResponse.json({ item: updated });
}
