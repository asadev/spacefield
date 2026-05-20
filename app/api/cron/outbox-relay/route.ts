import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
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
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Outbox relay can dispatch webhook + notification fanouts. Keep
// headroom for the full Vercel ceiling.
export const maxDuration = 300;

const RELAY_LIMIT = 25;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
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
