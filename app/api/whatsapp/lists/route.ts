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

interface UpsertListBody {
  workspace_id?: string;
  id?: string;
  name?: string;
  description?: string;
  contact_ids?: string[];
}

/** GET /api/whatsapp/lists?workspace_id=... → all lists for the workspace */
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
    .from("whatsapp_lists")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

/** POST /api/whatsapp/lists — create */
export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const body = await readJson<UpsertListBody>(req);
  if (!body.ok) return body.response;

  const { workspace_id: workspaceId, name, description, contact_ids } = body.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!name?.trim()) return jsonError("name required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_lists")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      description: description ?? null,
      contact_ids: Array.isArray(contact_ids) ? contact_ids : [],
      created_by: auth.user.id,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

/** PUT /api/whatsapp/lists — update by id */
export async function PUT(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const body = await readJson<UpsertListBody>(req);
  if (!body.ok) return body.response;

  const { id, workspace_id: workspaceId, name, description, contact_ids } =
    body.body;
  if (!id) return jsonError("id required", 400);
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = {};
  if (typeof name === "string") patch.name = name.trim();
  if (typeof description === "string") patch.description = description;
  if (Array.isArray(contact_ids)) patch.contact_ids = contact_ids;

  if (Object.keys(patch).length === 0) {
    return jsonError("nothing_to_update", 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_lists")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

/** DELETE /api/whatsapp/lists?id=...&workspace_id=... */
export async function DELETE(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const id = req.nextUrl.searchParams.get("id");
  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!id) return jsonError("id required", 400);
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { error } = await admin
    .from("whatsapp_lists")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
