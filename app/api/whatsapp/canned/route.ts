import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildContactFieldBag, interpolate } from "@/lib/whatsapp/inbox";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp canned responses / quick replies (EPIC-05). Workspace-scoped.
 * '/'+short_code in the composer inserts the content; {{var}} placeholders
 * are interpolated from the linked CRM contact at insert time.
 *
 * GET    /api/whatsapp/canned?workspace_id=                       → { items }
 * GET    /api/whatsapp/canned?workspace_id=&conversation_id=      → items with `rendered`
 * POST   /api/whatsapp/canned    create {short_code, content}
 * PATCH  /api/whatsapp/canned    update {id, short_code?, content?}
 * DELETE /api/whatsapp/canned?workspace_id=&id=
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

interface Canned {
  id: string;
  workspace_id: string;
  short_code: string;
  content: string;
  created_at: string;
}

function normCode(s: string): string {
  return s.trim().replace(/^\//, "").toLowerCase();
}

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const conversationId = sp.get("conversation_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_canned_responses")
    .select("id, workspace_id, short_code, content, created_at")
    .eq("workspace_id", workspaceId)
    .order("short_code", { ascending: true });
  if (error) return jsonError(error.message, 500);
  const items = (data ?? []) as Canned[];

  // When a conversation is supplied, also return the interpolated `rendered`
  // text so the composer can insert it directly.
  if (conversationId) {
    const bag = await buildContactFieldBag(admin, { workspaceId, conversationId });
    return NextResponse.json({
      items: items.map((i) => ({ ...i, rendered: interpolate(i.content, bag) })),
    });
  }
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<{
    workspace_id?: string;
    short_code?: string;
    content?: string;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, short_code, content } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!short_code?.trim()) return jsonError("short_code required", 400);
  if (!content?.trim()) return jsonError("content required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_canned_responses")
    .insert({
      workspace_id: workspaceId,
      short_code: normCode(short_code),
      content: content.trim(),
      created_by: auth.user.id,
    })
    .select("id, workspace_id, short_code, content, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return jsonError("short_code_exists", 409);
    return jsonError(error.message, 500);
  }
  return NextResponse.json({ canned: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<{
    workspace_id?: string;
    id?: string;
    short_code?: string;
    content?: string;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, id, short_code, content } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = {};
  if (short_code !== undefined) {
    if (!short_code.trim()) return jsonError("short_code cannot be empty", 400);
    patch.short_code = normCode(short_code);
  }
  if (content !== undefined) {
    if (!content.trim()) return jsonError("content cannot be empty", 400);
    patch.content = content.trim();
  }
  if (Object.keys(patch).length === 0) return jsonError("no_changes", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_canned_responses")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id, workspace_id, short_code, content, created_at")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return jsonError("short_code_exists", 409);
    return jsonError(error.message, 500);
  }
  if (!data) return jsonError("not_found", 404);
  return NextResponse.json({ canned: data });
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
    .from("whatsapp_canned_responses")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
