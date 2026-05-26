import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { disconnectInstance } from "@/lib/whatsapp/instance-manager";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceOwnerOrAdmin,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * DELETE /api/whatsapp/instance/delete?workspace_id=...
 *
 * Owner/admin-only. Removes the Evolution instance + marks the row
 * disconnected. Messages, lists, jobs and logs survive so the
 * workspace retains its history.
 */
export async function DELETE(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const gate = await requireWorkspaceOwnerOrAdmin(
    auth.supabase,
    workspaceId,
  );
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("whatsapp_instances")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return jsonError("no_instance", 404);
  }

  try {
    await disconnectInstance((row as { id: string }).id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "delete_failed";
    return jsonError(message, 500);
  }

  return NextResponse.json({ ok: true });
}
