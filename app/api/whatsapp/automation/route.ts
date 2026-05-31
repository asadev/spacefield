import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
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
 * WhatsApp automation rules (EPIC-09). App-side rule engine evaluated on the
 * inbound webhook: welcome / away / keyword auto-reply / numbered-menu router.
 * Actions reuse the shared executor vocabulary (send_text, send_canned,
 * send_media, send_menu, add_label, set_status, set_priority, assign).
 *
 * GET    /api/whatsapp/automation?workspace_id=                → { items }
 * POST   /api/whatsapp/automation   create rule
 * PATCH  /api/whatsapp/automation   update rule (incl. active toggle)
 * DELETE /api/whatsapp/automation?workspace_id=&id=
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

const EVENTS = new Set(["conversation_created", "message_created"]);
const ACTION_TYPES = new Set([
  "send_text",
  "send_canned",
  "send_media",
  "send_menu",
  "add_label",
  "set_status",
  "set_priority",
  "assign",
]);

interface RuleBody {
  workspace_id?: string;
  id?: string;
  name?: string;
  event_name?: string;
  conditions?: Record<string, unknown>;
  actions?: WhatsAppAction[];
  active?: boolean;
  priority?: number;
  stop_on_match?: boolean;
  recipe?: string;
}

function validateActions(actions: unknown): { ok: true; value: WhatsAppAction[] } | { ok: false; error: string } {
  if (!Array.isArray(actions)) return { ok: false, error: "actions must be an array" };
  const out: WhatsAppAction[] = [];
  for (const a of actions) {
    if (!a || typeof a !== "object") return { ok: false, error: "each action must be an object" };
    const type = (a as { type?: unknown }).type;
    if (typeof type !== "string" || !ACTION_TYPES.has(type)) {
      return { ok: false, error: `unknown action type: ${String(type)}` };
    }
    out.push({ type, params: ((a as { params?: Record<string, unknown> }).params) ?? {} });
  }
  return { ok: true, value: out };
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
    .from("whatsapp_automation_rules")
    .select(
      "id, name, event_name, conditions, actions, active, priority, stop_on_match, recipe, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<RuleBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.name?.trim()) return jsonError("name required", 400);
  const eventName = b.event_name ?? "message_created";
  if (!EVENTS.has(eventName)) return jsonError("invalid event_name", 400);
  const actions = validateActions(b.actions ?? []);
  if (!actions.ok) return jsonError(actions.error, 400);

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_automation_rules")
    .insert({
      workspace_id: b.workspace_id,
      name: b.name.trim(),
      event_name: eventName,
      conditions: b.conditions ?? {},
      actions: actions.value,
      active: b.active ?? true,
      priority: typeof b.priority === "number" ? b.priority : 100,
      stop_on_match: b.stop_on_match ?? true,
      recipe: b.recipe ?? "custom",
      created_by: auth.user.id,
    })
    .select(
      "id, name, event_name, conditions, actions, active, priority, stop_on_match, recipe, created_at, updated_at",
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

  const parsed = await readJson<RuleBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) {
    if (!b.name.trim()) return jsonError("name cannot be empty", 400);
    patch.name = b.name.trim();
  }
  if (b.event_name !== undefined) {
    if (!EVENTS.has(b.event_name)) return jsonError("invalid event_name", 400);
    patch.event_name = b.event_name;
  }
  if (b.conditions !== undefined) patch.conditions = b.conditions;
  if (b.actions !== undefined) {
    const actions = validateActions(b.actions);
    if (!actions.ok) return jsonError(actions.error, 400);
    patch.actions = actions.value;
  }
  if (b.active !== undefined) patch.active = !!b.active;
  if (b.priority !== undefined) patch.priority = Number(b.priority);
  if (b.stop_on_match !== undefined) patch.stop_on_match = !!b.stop_on_match;
  if (b.recipe !== undefined) patch.recipe = b.recipe;
  if (Object.keys(patch).length === 0) return jsonError("no_changes", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_automation_rules")
    .update(patch)
    .eq("id", b.id)
    .eq("workspace_id", b.workspace_id)
    .select(
      "id, name, event_name, conditions, actions, active, priority, stop_on_match, recipe, created_at, updated_at",
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
    .from("whatsapp_automation_rules")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
