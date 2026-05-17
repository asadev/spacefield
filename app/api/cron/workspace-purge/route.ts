import { NextResponse, type NextRequest } from "next/server";

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
 * Auth: matches /api/cron/audit-purge.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
