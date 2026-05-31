/* /api/cron/whatsapp-sequence-runner — drains due drip-sequence enrollments.
 *
 * EPIC-19. Claims due whatsapp_sequence_enrollments (claim_due_enrollments RPC,
 * skip-locked) and advances each one step-by-step through the SHARED action
 * executor (lib/whatsapp/sequences.ts → executeActions), so every send respects
 * the throttle, isSuppressed() (consent, fail-closed), exit-on-reply and the
 * soft-ban pause. Bounded per tick to stay under Vercel's 300s ceiling.
 *
 * Cadence: ideally every minute (Hetzner cron line in the build report); Vercel
 * Hobby caps at daily, so vercel.json registers it daily as a floor.
 *
 * Auth: requireCron (timing-safe Bearer / ?token= against CRON_SECRET; hard-
 * fails when CRON_SECRET is unset). Gated behind an advisory lock so two firings
 * don't both claim the same enrollments.
 */

import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { withAdvisoryLock } from "@/lib/db/advisory-lock";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimDueEnrollments, processEnrollment } from "@/lib/whatsapp/sequences";
import { safeErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PER_TICK = 25;

export async function GET(req: NextRequest): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const gated = await withAdvisoryLock(
      "spacefield:whatsapp-sequence-runner",
      async () => {
        const admin = createAdminClient();
        const due = await claimDueEnrollments(admin, MAX_PER_TICK);
        let sent = 0;
        let exited = 0;
        let completed = 0;
        let failed = 0;
        for (const e of due) {
          const outcome = await processEnrollment(admin, e);
          if (outcome === "sent") sent++;
          else if (outcome === "exited" || outcome === "suppressed") exited++;
          else if (outcome === "completed") completed++;
          else failed++;
        }
        return { claimed: due.length, sent, exited, completed, failed };
      },
    );
    if (!gated.acquired) {
      return NextResponse.json({ ok: true, skipped: true, reason: "advisory_lock_held" });
    }
    return NextResponse.json({ ok: true, ...(gated.value ?? {}) });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "cron.whatsapp_sequence_runner",
          fallback: "sequence_runner_failed",
        }),
      },
      { status: 500 },
    );
  }
}
