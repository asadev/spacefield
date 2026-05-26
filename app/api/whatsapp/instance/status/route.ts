import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import { getInstanceSendStats } from "@/lib/whatsapp/throttle";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/instance/status?workspace_id=...
 *
 * Returns the current row + a small stats bundle so the UI can render
 * "Daily cap: 12 / 200" without a second round-trip.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({
      status: null,
      phone_number: null,
      paired_at: null,
      qr_code: null,
      stats: null,
    });
  }

  const inst = row as WhatsAppInstanceRow;
  let stats:
    | Awaited<ReturnType<typeof getInstanceSendStats>>
    | null = null;
  try {
    stats = await getInstanceSendStats(inst.id);
  } catch {
    stats = null;
  }

  return NextResponse.json({
    instance_id: inst.id,
    status: inst.status,
    phone_number: inst.phone_number,
    paired_at: inst.paired_at,
    qr_code: inst.qr_code,
    last_seen_at: inst.last_seen_at,
    stats,
  });
}
