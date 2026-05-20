import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/workspace-purge
 *
 * Daily Vercel cron — calls public.hard_delete_expired_workspaces(),
 * removing workspaces whose workspace_deletion_requests row has
 * cancelled_at IS NULL and grace_until < now().
 *
 * Cascades clean workspace_members, workspace_state, workspace_files,
 * and any other table with `references public.workspaces(id) on delete
 * cascade`. The deletion-request row itself goes via its own cascade.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("hard_delete_expired_workspaces");
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const deleted = typeof data === "number" ? data : 0;
  return NextResponse.json({ ok: true, deleted });
}
