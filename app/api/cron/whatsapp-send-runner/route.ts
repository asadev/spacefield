import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { withAdvisoryLock } from "@/lib/db/advisory-lock";
import { runQueuedWhatsAppJobs } from "@/lib/whatsapp/runner";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDueStatusPosts } from "@/lib/whatsapp/status-runner";

/* GET /api/cron/whatsapp-send-runner
 *
 * Drains queued whatsapp_send_jobs under throttle. Designed to run on
 * a tight schedule (1-5 minute) when WhatsApp pairings are active.
 * Each tick processes up to RUNNER_LIMIT jobs and at most MAX_PER_TICK
 * contacts per job (defined inside lib/whatsapp/runner.ts) so we never
 * blow past Vercel's 300s ceiling.
 *
 * Gated behind a Postgres advisory lock so two cron firings in the
 * same second don't both flip the same queued rows to running.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RUNNER_LIMIT = 3;

export async function GET(req: NextRequest): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const gated = await withAdvisoryLock(
      "spacefield:whatsapp-send-runner",
      async () => {
        const jobs = await runQueuedWhatsAppJobs(RUNNER_LIMIT);
        // EPIC-18: drain due scheduled WhatsApp Status posts on the same tick
        // (also paced through the throttle). Best-effort — never fails the run.
        let status = { sent: 0, failed: 0 };
        try {
          status = await runDueStatusPosts(createAdminClient(), 5);
        } catch {
          status = { sent: 0, failed: 0 };
        }
        return { ...jobs, status_posts: status };
      },
    );
    if (!gated.acquired) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "advisory_lock_held",
      });
    }
    return NextResponse.json({ ok: true, ...(gated.value ?? {}) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
