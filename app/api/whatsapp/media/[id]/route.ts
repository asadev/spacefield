import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { signedMediaUrl } from "@/lib/whatsapp/media";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/media/[id]?workspace_id=...
 *
 * Streams a message's re-hosted media to the authenticated operator.
 * `[id]` = whatsapp_messages.id. We look up the row (scoped to the caller's
 * workspace), then 302-redirect to a short-lived signed URL for the private
 * `whatsapp-media` object. Returns 404 when the message has no re-hosted
 * media yet (e.g. rehost still pending or failed).
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id: messageId } = await ctx.params;
  if (!messageId) return jsonError("id required", 400);

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("whatsapp_messages")
    .select("id, media_storage_path")
    .eq("id", messageId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!row) return jsonError("not_found", 404);
  const r = row as { id: string; media_storage_path: string | null };
  if (!r.media_storage_path) return jsonError("no_media", 404);

  const signed = await signedMediaUrl(admin, r.media_storage_path);
  if (!signed) return jsonError("sign_failed", 500);

  return NextResponse.redirect(signed, 302);
}
