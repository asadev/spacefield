import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateMacroActions } from "@/lib/whatsapp/macros";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import type { WhatsAppAction } from "@/lib/whatsapp/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp macros (EPIC-14). A macro is an ordered list of actions in the
 * SAME vocabulary as automation rules; it's RUN against a conversation via
 * POST /api/whatsapp/conversations/[id]/macros, reusing the shared action
 * executor (lib/whatsapp/actions.ts). This route is the CRUD surface.
 *
 * GET    /api/whatsapp/macros?workspace_id=          → { items } (global + own personal)
 * POST   /api/whatsapp/macros   { workspace_id, name, actions, visibility?, description? }
 * PATCH  /api/whatsapp/macros   { workspace_id, id, name?, actions?, visibility?, description? }
 * DELETE /api/whatsapp/macros?workspace_id=&id=
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

interface MacroBody {
  workspace_id?: string;
  id?: string;
  name?: string;
  description?: string;
  actions?: WhatsAppAction[];
  visibility?: "global" | "personal";
}

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
  const { data, error } = await admin
    .from("whatsapp_macros")
    .select(
      "id, name, description, actions, visibility, created_by, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  if (error) return jsonError(error.message, 500);

  // Hide other users' PERSONAL macros; keep all global + the caller's own.
  const items = (data ?? []).filter((m) => {
    const row = m as { visibility: string; created_by: string | null };
    return row.visibility !== "personal" || row.created_by === auth.user.id;
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<MacroBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.name?.trim()) return jsonError("name required", 400);
  const actions = validateMacroActions(b.actions ?? []);
  if (!actions.ok) return jsonError(actions.error, 400);
  const visibility = b.visibility === "personal" ? "personal" : "global";

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_macros")
    .insert({
      workspace_id: b.workspace_id,
      name: b.name.trim(),
      description: b.description?.trim() || null,
      actions: actions.value,
      visibility,
      created_by: auth.user.id,
    })
    .select(
      "id, name, description, actions, visibility, created_by, created_at, updated_at",
    )
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<MacroBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) {
    if (!b.name.trim()) return jsonError("name cannot be empty", 400);
    patch.name = b.name.trim();
  }
  if (b.description !== undefined) patch.description = b.description?.trim() || null;
  if (b.actions !== undefined) {
    const actions = validateMacroActions(b.actions);
    if (!actions.ok) return jsonError(actions.error, 400);
    patch.actions = actions.value;
  }
  if (b.visibility !== undefined) {
    patch.visibility = b.visibility === "personal" ? "personal" : "global";
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_macros")
    .update(patch)
    .eq("id", b.id)
    .eq("workspace_id", b.workspace_id)
    .select(
      "id, name, description, actions, visibility, created_by, created_at, updated_at",
    )
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("not_found", 404);
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const id = sp.get("id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { error } = await admin
    .from("whatsapp_macros")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
