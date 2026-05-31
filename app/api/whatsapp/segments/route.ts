import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  countSegmentRecipients,
  type SegmentQuery,
} from "@/lib/whatsapp/segments";
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
 * WhatsApp dynamic audience segments (EPIC-08). A segment's `query` jsonb is
 * resolved to recipients AT SEND TIME by the runner, so it always reflects
 * current labels / custom fields / lifecycle / last-contacted.
 *
 * GET    /api/whatsapp/segments?workspace_id=                  → { items }
 * GET    /api/whatsapp/segments?workspace_id=&id=&count=1      → { count } (preview)
 * POST   /api/whatsapp/segments   { workspace_id, name, description?, query }
 * PATCH  /api/whatsapp/segments   { workspace_id, id, name?, description?, query? }
 * DELETE /api/whatsapp/segments?workspace_id=&id=
 * POST   /api/whatsapp/segments   { workspace_id, query, preview: true } → { count } (ad-hoc preview)
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

interface SegmentBody {
  workspace_id?: string;
  id?: string;
  name?: string;
  description?: string;
  query?: SegmentQuery;
  preview?: boolean;
}

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

  // Recipient-count preview for a saved segment.
  const id = sp.get("id");
  if (id && sp.get("count") === "1") {
    const { data: seg } = await admin
      .from("whatsapp_segments")
      .select("query")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (!seg) return jsonError("not_found", 404);
    const count = await countSegmentRecipients(
      admin,
      workspaceId,
      ((seg as { query?: SegmentQuery }).query ?? {}) as SegmentQuery,
    );
    return NextResponse.json({ count });
  }

  const { data, error } = await admin
    .from("whatsapp_segments")
    .select("id, name, description, query, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<SegmentBody>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, name, description, query, preview } =
    parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Ad-hoc preview (no save): resolve count for an arbitrary query.
  if (preview) {
    const count = await countSegmentRecipients(
      admin,
      workspaceId,
      (query ?? {}) as SegmentQuery,
    );
    return NextResponse.json({ count });
  }

  if (!name?.trim()) return jsonError("name required", 400);
  const { data, error } = await admin
    .from("whatsapp_segments")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      description: description?.trim() || null,
      query: query ?? {},
      created_by: auth.user.id,
    })
    .select("id, name, description, query, created_at, updated_at")
    .single();
  if (error) {
    if (error.code === "23505") return jsonError("name_exists", 409);
    return jsonError(error.message, 500);
  }
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<SegmentBody>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, id, name, description, query } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) return jsonError("name cannot be empty", 400);
    patch.name = name.trim();
  }
  if (description !== undefined) patch.description = description?.trim() || null;
  if (query !== undefined) patch.query = query;
  if (Object.keys(patch).length === 0) return jsonError("no_changes", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_segments")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id, name, description, query, created_at, updated_at")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return jsonError("name_exists", 409);
    return jsonError(error.message, 500);
  }
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
    .from("whatsapp_segments")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
