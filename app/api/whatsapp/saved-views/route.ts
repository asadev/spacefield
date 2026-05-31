import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
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
 * WhatsApp saved views (EPIC-13). Named filter combos per user, e.g.
 * "My open wholesale", "Unassigned today". The `query` jsonb holds the same
 * filter set the conversations list accepts (view/status/assignee/label/
 * priority/unread/lifecycle). RLS already restricts rows to the owner.
 *
 * GET    /api/whatsapp/saved-views?workspace_id=         → { items }
 * POST   /api/whatsapp/saved-views   { workspace_id, name, query }
 * PATCH  /api/whatsapp/saved-views   { workspace_id, id, name?, query? }
 * DELETE /api/whatsapp/saved-views?workspace_id=&id=
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember (RLS scopes to
 * user_id = auth.uid()); we ALSO filter by user_id on the admin client so the
 * service-role reads stay user-scoped.
 */

interface ViewBody {
  workspace_id?: string;
  id?: string;
  name?: string;
  query?: Record<string, unknown>;
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
    .from("whatsapp_saved_views")
    .select("id, name, query, position, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", auth.user.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<ViewBody>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, name, query } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!name?.trim()) return jsonError("name required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_saved_views")
    .insert({
      workspace_id: workspaceId,
      user_id: auth.user.id,
      name: name.trim(),
      query: query ?? {},
    })
    .select("id, name, query, position, created_at, updated_at")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<ViewBody>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, id, name, query } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) {
    if (!name.trim()) return jsonError("name cannot be empty", 400);
    patch.name = name.trim();
  }
  if (query !== undefined) patch.query = query;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_saved_views")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .eq("user_id", auth.user.id)
    .select("id, name, query, position, created_at, updated_at")
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
    .from("whatsapp_saved_views")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .eq("user_id", auth.user.id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
