import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/account-purge
 *
 * Daily Vercel cron — calls public.hard_delete_expired_accounts(),
 * which removes auth.users rows whose account_deletion_requests row
 * has cancelled_at IS NULL and grace_until < now() (i.e. user
 * requested deletion at least 30 days ago and never cancelled).
 *
 * auth.users cascades delete to public.profiles + public.workspaces
 * (when the user is the workspaces.user_id owner) + anything else
 * with `references auth.users(id) on delete cascade`. The matching
 * account_deletion_requests row goes with it via its own cascade.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron. Hard-fails when
 * CRON_SECRET is unset; otherwise timing-safe compares the Bearer
 * token (or ?token= query). No UA fallback.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("hard_delete_expired_accounts");
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const deleted = typeof data === "number" ? data : 0;
  return NextResponse.json({ ok: true, deleted });
}
