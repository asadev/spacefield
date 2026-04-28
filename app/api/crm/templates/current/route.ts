/* ─────────────────────────────────────────────────────────────────────────
 * GET /api/crm/templates/current?workspace_id=...
 *
 * Reads `workspace_state` row at key `crm:template-id` and returns the
 * stored template id (or null if never applied). Members can read; the
 * apply route is admin-gated separately.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import {
  jsonError,
  requireUser,
  requireWorkspaceMember,
} from "../../_helpers";

interface StateValue {
  template_id?: string;
  applied_at?: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const { data, error } = await auth.supabase
    .from("workspace_state")
    .select("value")
    .eq("workspace_id", workspaceId)
    .eq("key", "crm:template-id")
    .maybeSingle();
  if (error) return jsonError(error.message, 500);

  const value = (data?.value ?? null) as StateValue | null;
  return NextResponse.json({
    template_id: value?.template_id ?? null,
    applied_at: value?.applied_at ?? null,
  });
}
