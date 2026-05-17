import { NextResponse, type NextRequest } from "next/server";

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
 * Auth follows the same convention as the other cron routes — accepts
 * either `Authorization: Bearer <CRON_SECRET>` or the `vercel-cron`
 * UA / `x-vercel-cron` header.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_LIMIT = 5;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runQueuedAIBatch(BATCH_LIMIT);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
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
