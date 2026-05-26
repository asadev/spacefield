import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

/**
 * GET /api/whatsapp/jobs?workspace_id=...&status=&limit=&cursor=&id=
 *
 * List + detail in one route to keep the surface area small. When
 * `id=` is provided we return a single full job + the last 100 log
 * rows. Otherwise we paginate over the jobs list.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  const id = sp.get("id");
  if (id) {
    const { data: job, error } = await admin
      .from("whatsapp_send_jobs")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!job) return jsonError("not_found", 404);

    const { data: logs } = await admin
      .from("whatsapp_send_log")
      .select(
        "id, to_number, body, status, evolution_message_id, sent_at, contact_id",
      )
      .eq("job_id", id)
      .order("sent_at", { ascending: false })
      .limit(100);

    return NextResponse.json({ item: job, logs: logs ?? [] });
  }

  const status = sp.get("status");
  const limit = Math.min(
    Number(sp.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const cursor = sp.get("cursor");

  let query = admin
    .from("whatsapp_send_jobs")
    .select(
      "id, target_type, target_id, status, total_contacts, sent_count, failed_count, error_message, started_at, completed_at, created_at, created_by",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  const last = data && data.length > 0 ? data[data.length - 1] : null;
  return NextResponse.json({
    items: data ?? [],
    next_cursor:
      data && data.length === limit && last
        ? (last as { created_at: string }).created_at
        : null,
  });
}
