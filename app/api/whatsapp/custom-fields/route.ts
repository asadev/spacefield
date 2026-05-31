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
 * WhatsApp custom attribute DEFINITIONS (EPIC-07). Admin-defined fields;
 * values live in the custom_attributes jsonb on whatsapp_conversations
 * (see PATCH /api/whatsapp/conversations/[id]/attributes).
 *
 * GET    /api/whatsapp/custom-fields?workspace_id=[&model=]   → { items }
 * POST   create {display_name, attribute_key, attribute_type?, attribute_model?, attribute_values?}
 * PATCH  update {id, display_name?, attribute_type?, attribute_values?, position?}
 * DELETE ?workspace_id=&id=
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

const TYPES = ["text", "number", "currency", "date", "list", "checkbox"];
const MODELS = ["conversation", "contact"];

function keyify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const model = sp.get("model");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  let q = admin
    .from("whatsapp_custom_attribute_definitions")
    .select(
      "id, workspace_id, display_name, attribute_key, attribute_type, attribute_model, attribute_values, position, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (model && MODELS.includes(model)) q = q.eq("attribute_model", model);
  const { data, error } = await q;
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<{
    workspace_id?: string;
    display_name?: string;
    attribute_key?: string;
    attribute_type?: string;
    attribute_model?: string;
    attribute_values?: unknown[];
  }>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.display_name?.trim()) return jsonError("display_name required", 400);

  const type = b.attribute_type ?? "text";
  if (!TYPES.includes(type)) return jsonError(`attribute_type must be one of ${TYPES.join("|")}`, 400);
  const model = b.attribute_model ?? "conversation";
  if (!MODELS.includes(model)) return jsonError(`attribute_model must be ${MODELS.join("|")}`, 400);

  const key = b.attribute_key?.trim() ? keyify(b.attribute_key) : keyify(b.display_name);
  if (!key) return jsonError("attribute_key invalid", 400);

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_custom_attribute_definitions")
    .insert({
      workspace_id: b.workspace_id,
      display_name: b.display_name.trim(),
      attribute_key: key,
      attribute_type: type,
      attribute_model: model,
      attribute_values: Array.isArray(b.attribute_values) ? b.attribute_values : [],
      created_by: auth.user.id,
    })
    .select(
      "id, workspace_id, display_name, attribute_key, attribute_type, attribute_model, attribute_values, position, created_at",
    )
    .single();
  if (error) {
    if (error.code === "23505") return jsonError("attribute_key_exists", 409);
    return jsonError(error.message, 500);
  }
  return NextResponse.json({ definition: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<{
    workspace_id?: string;
    id?: string;
    display_name?: string;
    attribute_type?: string;
    attribute_values?: unknown[];
    position?: number;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = {};
  if (b.display_name !== undefined) {
    if (!b.display_name.trim()) return jsonError("display_name cannot be empty", 400);
    patch.display_name = b.display_name.trim();
  }
  if (b.attribute_type !== undefined) {
    if (!TYPES.includes(b.attribute_type)) return jsonError("invalid attribute_type", 400);
    patch.attribute_type = b.attribute_type;
  }
  if (b.attribute_values !== undefined) {
    patch.attribute_values = Array.isArray(b.attribute_values) ? b.attribute_values : [];
  }
  if (b.position !== undefined && Number.isFinite(b.position)) patch.position = b.position;
  if (Object.keys(patch).length === 0) return jsonError("no_changes", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_custom_attribute_definitions")
    .update(patch)
    .eq("id", b.id)
    .eq("workspace_id", b.workspace_id)
    .select(
      "id, workspace_id, display_name, attribute_key, attribute_type, attribute_model, attribute_values, position, created_at",
    )
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("not_found", 404);
  return NextResponse.json({ definition: data });
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
    .from("whatsapp_custom_attribute_definitions")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
