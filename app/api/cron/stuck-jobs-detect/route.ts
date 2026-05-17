/* /api/cron/stuck-jobs-detect — every 5 minutes.
 *
 * Scans workflow_runs + ai_batch_jobs for rows that have been stuck in
 * `status='running'` for longer than the threshold (default 30 min),
 * flips them to `status='stuck'`, and emits an in-app notification to
 * every admin so the breakage is visible without anyone having to
 * watch /admin/status.
 *
 * Heavy lifting is done by the `detect_stuck_jobs` RPC so the
 * `update returning count(*)` happens in a single round trip per
 * table. Notification fan-out is done by `stuck_jobs_alert` so we
 * don't enumerate admins in app code.
 *
 * Auth pattern mirrors /api/cron/suspicious-login-scan:
 *   - `Authorization: Bearer <CRON_SECRET>` for manual / staging runs
 *   - `vercel-cron/1.0` user-agent (Vercel-issued cron)
 *   - `x-vercel-cron` header (Vercel-issued cron)
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { histogram, METRIC_NAMES } from "@/lib/metrics";
import { safeErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_THRESHOLD_MIN = 30;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Threshold override via ?minutes=N (used for testing). Clamp to a
  // sane range so a bad value can't accidentally mark every running
  // job stuck.
  const url = new URL(req.url);
  const raw = url.searchParams.get("minutes");
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const thresholdMinutes =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= 24 * 60
      ? parsed
      : DEFAULT_THRESHOLD_MIN;

  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("detect_stuck_jobs", {
      threshold_minutes: thresholdMinutes,
    });

    if (error) {
      log.error("cron.stuck_jobs.rpc_failed", { error: error.message });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // `detect_stuck_jobs` returns one row. Supabase wraps RPC results
    // returning multiple columns as an array of objects.
    const row = Array.isArray(data) ? data[0] : data;
    const workflowStuck = Number(row?.workflow_stuck ?? 0);
    const batchStuck = Number(row?.batch_stuck ?? 0);
    const totalStuck = workflowStuck + batchStuck;

    // Emit queue-depth metrics for each queue, regardless of whether
    // anything was flipped this tick. Depth = rows currently waiting
    // in `queued` OR actively running. We split into two observations
    // (queued vs running) so the dashboard can render "backlog" and
    // "in-flight" independently — the same total can mean very
    // different things ("nothing started" vs "lots in progress").
    // Failure is non-fatal; we just skip the metric on that table.
    try {
      const { count: wfQueued } = await admin
        .from("workflow_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued");
      const { count: wfRunning } = await admin
        .from("workflow_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      histogram(
        METRIC_NAMES.queueDepthWorkflowRuns,
        (wfQueued ?? 0) + (wfRunning ?? 0),
        { state: "active" }
      );
      histogram(METRIC_NAMES.queueDepthWorkflowRuns, wfQueued ?? 0, {
        state: "queued",
      });
      histogram(METRIC_NAMES.queueDepthWorkflowRuns, wfRunning ?? 0, {
        state: "running",
      });
    } catch (e) {
      log.warn("cron.stuck_jobs.queue_depth_failed", {
        queue: "workflow_runs",
        error: (e as Error).message,
      });
    }

    try {
      const { count: aiQueued } = await admin
        .from("ai_batch_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued");
      const { count: aiRunning } = await admin
        .from("ai_batch_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      histogram(
        METRIC_NAMES.queueDepthAiBatchJobs,
        (aiQueued ?? 0) + (aiRunning ?? 0),
        { state: "active" }
      );
      histogram(METRIC_NAMES.queueDepthAiBatchJobs, aiQueued ?? 0, {
        state: "queued",
      });
      histogram(METRIC_NAMES.queueDepthAiBatchJobs, aiRunning ?? 0, {
        state: "running",
      });
    } catch (e) {
      log.warn("cron.stuck_jobs.queue_depth_failed", {
        queue: "ai_batch_jobs",
        error: (e as Error).message,
      });
    }

    let notifiedAdmins = 0;
    if (totalStuck > 0) {
      const parts: string[] = [];
      if (workflowStuck > 0) {
        parts.push(`${workflowStuck} workflow run(s)`);
      }
      if (batchStuck > 0) {
        parts.push(`${batchStuck} AI batch job(s)`);
      }
      const title = `${totalStuck} stuck job${totalStuck === 1 ? "" : "s"} detected`;
      const body = `${parts.join(" + ")} were running for more than ${thresholdMinutes} min and were flipped to status=stuck.`;

      const { data: alertData, error: alertErr } = await admin.rpc(
        "stuck_jobs_alert",
        {
          p_title: title,
          p_body: body,
          p_payload: {
            workflow_stuck: workflowStuck,
            batch_stuck: batchStuck,
            threshold_minutes: thresholdMinutes,
            detected_at: new Date().toISOString(),
          },
        }
      );

      if (alertErr) {
        log.warn("cron.stuck_jobs.alert_failed", {
          error: alertErr.message,
          workflow_stuck: workflowStuck,
          batch_stuck: batchStuck,
        });
      } else {
        notifiedAdmins = Number(alertData ?? 0);
      }

      log.info("cron.stuck_jobs.flipped", {
        workflow_stuck: workflowStuck,
        batch_stuck: batchStuck,
        threshold_minutes: thresholdMinutes,
        notified_admins: notifiedAdmins,
      });
    }

    return NextResponse.json({
      ok: true,
      threshold_minutes: thresholdMinutes,
      workflow_stuck: workflowStuck,
      batch_stuck: batchStuck,
      total_stuck: totalStuck,
      notified_admins: notifiedAdmins,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "cron.stuck_jobs_detect",
          fallback: "scan_failed",
        }),
      },
      { status: 500 }
    );
  }
}

function isAuthorizedCronCall(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.toLowerCase().includes("vercel-cron")) return true;
  if (req.headers.get("x-vercel-cron")) return true;
  return false;
}
