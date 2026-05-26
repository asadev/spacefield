import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { refreshQR } from "@/lib/whatsapp/instance-manager";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/whatsapp/instance/connect?workspace_id=...
 *
 * Returns the latest QR code for the workspace's instance. If no QR is
 * stored we hit Evolution to fetch one; the polling client should hit
 * this every 3s and stop once `status === 'connected'`.
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
    .not("status", "in", "(banned,error)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return jsonError("no_instance", 404);
  }

  const inst = row as WhatsAppInstanceRow;

  let qr = inst.qr_code;
  let status = inst.status;
  if (status !== "connected" && !qr) {
    try {
      qr = await refreshQR(inst.id);
      // Reload fresh status after refreshQR persisted it.
      const { data: updated } = await admin
        .from("whatsapp_instances")
        .select("status, phone_number")
        .eq("id", inst.id)
        .maybeSingle();
      if (updated?.status) status = updated.status;
    } catch (e) {
      const message = e instanceof Error ? e.message : "refresh_failed";
      // eslint-disable-next-line no-console
      console.error("[whatsapp.connect] refreshQR failed:", message);
    }
  }

  return NextResponse.json({
    instance_id: inst.id,
    status,
    qr_code: qr,
    phone_number: inst.phone_number,
    paired_at: inst.paired_at,
  });
}
