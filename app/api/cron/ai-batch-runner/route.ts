import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { runQueuedAIBatch } from "@/lib/ai/batch";

/* GET /api/cron/ai-batch-runner
 *
 * Drains up to 5 queued rows from `ai_batch_jobs` per tick. Wired in
 * `vercel.json` to run every minute (`* * * * *`).
 *
 * Each job has a 4-minute per-job wall-clock cap inside `runOne`, and
 * the function `maxDuration = 300` (the Vercel ceiling) so we have
 * headroom for 5 sequential jobs of ~30-60s each.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_LIMIT = 5;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const result = await runQueuedAIBatch(BATCH_LIMIT);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
