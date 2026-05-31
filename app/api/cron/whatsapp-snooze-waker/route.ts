/* /api/cron/whatsapp-snooze-waker — wakes snoozed WhatsApp conversations.
 *
 * EPIC-03 lifecycle. Any conversation in status=3 (snoozed) whose
 * snoozed_until has passed is flipped back to status=0 (open) and its
 * snoozed_until cleared, so it re-surfaces in the operator's queue.
 * ("Snooze until next reply" is handled separately by the inbound webhook,
 * which already auto-reopens via whatsapp_record_inbound.)
 *
 * Single UPDATE … RETURNING via the whatsapp_wake_snoozed RPC so the woken
 * count comes back in one round trip; falls back to a direct update if the
 * RPC is missing.
 *
 * Cadence: ideally every minute (Hetzner cron line in the build report);
 * Vercel Hobby caps at daily, so vercel.json registers it daily as a floor.
 *
 * Auth: requireCron (timing-safe Bearer / ?token= against CRON_SECRET;
 * hard-fails when CRON_SECRET is unset). Copied from the other cron routes.
 */

import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { safeErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // Preferred: RPC returns the woken count in one round trip.
    const rpc = await admin.rpc("whatsapp_wake_snoozed");
    if (!rpc.error) {
      const woken = Number(rpc.data ?? 0);
      if (woken > 0) log.info("cron.whatsapp_snooze_waker.woke", { woken });
      return NextResponse.json({ ok: true, woken });
    }

    // Fallback: direct update (RPC not present in this environment). Select
    // the due ids first so we can report a count, then flip them.
    const { data: due, error: selErr } = await admin
      .from("whatsapp_conversations")
      .select("id")
      .eq("status", 3)
      .not("snoozed_until", "is", null)
      .lte("snoozed_until", nowIso);
    if (selErr) {
      log.error("cron.whatsapp_snooze_waker.select_failed", {
        error: selErr.message,
      });
      return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
    }
    const ids = (due ?? []).map((r) => (r as { id: string }).id);
    if (ids.length === 0) return NextResponse.json({ ok: true, woken: 0 });

    const { error: updErr } = await admin
      .from("whatsapp_conversations")
      .update({ status: 0, snoozed_until: null, last_activity_at: nowIso })
      .in("id", ids);
    if (updErr) {
      log.error("cron.whatsapp_snooze_waker.update_failed", {
        error: updErr.message,
      });
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }
    log.info("cron.whatsapp_snooze_waker.woke", { woken: ids.length });
    return NextResponse.json({ ok: true, woken: ids.length });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "cron.whatsapp_snooze_waker",
          fallback: "wake_failed",
        }),
      },
      { status: 500 },
    );
  }
}
