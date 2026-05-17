import { NextResponse, type NextRequest } from "next/server";

import { runOutboxRelay } from "@/lib/outbox";
import { withAdvisoryLock, AdvisoryLockKeys } from "@/lib/db/advisory-lock";

/* GET /api/cron/outbox-relay
 *
 * Drains a batch of `event_outbox` rows per tick. Wired in
 * `vercel.json` to run every minute (`* * * * *`).
 *
 * The relay does its own pessimistic claim via `claim_outbox_batch`
 * (FOR UPDATE SKIP LOCKED inside the RPC), but we ALSO gate the whole
 * tick behind a Postgres advisory lock so two cron invocations that
 * happen to fire in the same second don't both stage a batch. If we
 * don't get the lock we silently no-op — the next tick will pick up
 * what's left.
 *
 * Auth follows the same convention as the other cron routes — accepts
 * either `Authorization: Bearer <CRON_SECRET>` or the `vercel-cron`
 * UA / `x-vercel-cron` header.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Outbox relay can dispatch webhook + notification fanouts. Keep
// headroom for the full Vercel ceiling.
export const maxDuration = 300;

const RELAY_LIMIT = 25;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const gated = await withAdvisoryLock(
      AdvisoryLockKeys.OutboxRelay,
      async () => runOutboxRelay(RELAY_LIMIT),
    );
    if (!gated.acquired) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "advisory-lock held by another runner",
      });
    }
    return NextResponse.json({ ok: true, ...(gated.value ?? {}) });
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
