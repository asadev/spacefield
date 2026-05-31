import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { runMacro } from "@/lib/whatsapp/macros";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A macro can fire several throttled sends; allow Evolution headroom.
export const maxDuration = 60;

/**
 * POST /api/whatsapp/conversations/[id]/macros   (EPIC-14)
 * Body: { workspace_id, macro_id }
 *
 * Runs a saved macro against the open conversation via the SHARED action
 * executor (lib/whatsapp/actions.ts) — every send still routes through the
 * throttle + isSuppressed() (consent). Returns the per-action results.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id: conversationId } = await ctx.params;
  if (!conversationId) return jsonError("id required", 400);

  const parsed = await readJson<{ workspace_id?: string; macro_id?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, macro_id: macroId } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!macroId) return jsonError("macro_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Ownership check on the conversation.
  const { data: conv } = await admin
    .from("whatsapp_conversations")
    .select("id, workspace_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return jsonError("not_found", 404);
  if ((conv as { workspace_id: string }).workspace_id !== workspaceId) {
    return jsonError("forbidden", 403);
  }

  const result = await runMacro({
    admin,
    workspaceId,
    conversationId,
    macroId,
    actorUserId: auth.user.id,
  });
  if (!result.ok) {
    const status =
      result.error === "macro_not_found" || result.error === "conversation_not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 400;
    return jsonError(result.error ?? "macro_failed", status);
  }
  return NextResponse.json({ ok: true, results: result.results });
}
