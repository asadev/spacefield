import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { enrollInSequence } from "@/lib/whatsapp/sequences";
import { SEQUENCE_RECIPES } from "@/lib/whatsapp/sequence-recipes";
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
 * WhatsApp drip sequences (EPIC-19). A sequence is a multi-step, time-delayed
 * series of actions; enrolled contacts are advanced by the
 * whatsapp-sequence-runner cron through the shared executor (throttle + consent
 * + exit-on-reply). Steps shape: [{ delay_minutes, actions[] }].
 *
 * GET    /api/whatsapp/sequences?workspace_id=[&recipes=1]            → { items, recipes? }
 * POST   /api/whatsapp/sequences  { workspace_id, name, steps?, exit_conditions?, recipe_key? }
 *        enroll: { workspace_id, action:'enroll', sequence_id, conversation_id }
 * PATCH  /api/whatsapp/sequences  { workspace_id, id, name?, steps?, exit_conditions?, active? }
 * DELETE /api/whatsapp/sequences?workspace_id=&id=
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

const COLS =
  "id, name, description, steps, exit_conditions, recipe_key, active, created_at, updated_at";

const ACTION_TYPES = new Set([
  "send_text",
  "send_canned",
  "send_media",
  "send_menu",
  "send_product",
  "ai_reply",
  "add_label",
  "set_status",
  "set_priority",
  "assign",
]);

interface RawStep {
  delay_minutes?: number;
  actions?: Array<{ type?: string; params?: Record<string, unknown> }>;
}

function sanitizeSteps(raw: unknown): RawStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const step = s as RawStep;
    const actions = Array.isArray(step?.actions)
      ? step.actions
          .filter((a) => typeof a?.type === "string" && ACTION_TYPES.has(a.type as string))
          .map((a) => ({ type: a.type as string, params: a.params ?? {} }))
      : [];
    return {
      delay_minutes: Math.max(0, Number(step?.delay_minutes ?? 0)),
      actions,
    };
  });
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
  const { data, error } = await admin
    .from("whatsapp_sequences")
    .select(COLS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) return jsonError(error.message, 500);

  // Active-enrollment counts per sequence (best-effort, single grouped pass).
  const counts = new Map<string, number>();
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (ids.length > 0) {
    const { data: enr } = await admin
      .from("whatsapp_sequence_enrollments")
      .select("sequence_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .in("sequence_id", ids);
    for (const e of enr ?? []) {
      const sid = (e as { sequence_id: string }).sequence_id;
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
  }
  const items = (data ?? []).map((r) => ({
    ...(r as Record<string, unknown>),
    active_enrollments: counts.get((r as { id: string }).id) ?? 0,
  }));

  const body: Record<string, unknown> = { items };
  if (sp.get("recipes")) body.recipes = SEQUENCE_RECIPES;
  return NextResponse.json(body);
}

interface SequenceBody {
  workspace_id?: string;
  id?: string;
  action?: string;
  sequence_id?: string;
  conversation_id?: string;
  name?: string;
  description?: string | null;
  steps?: unknown;
  exit_conditions?: { on_reply?: boolean };
  recipe_key?: string;
  active?: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<SequenceBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Manual enroll: add a conversation's contact to a sequence.
  if (b.action === "enroll") {
    if (!b.sequence_id) return jsonError("sequence_id required", 400);
    if (!b.conversation_id) return jsonError("conversation_id required", 400);
    const { data: conv } = await admin
      .from("whatsapp_conversations")
      .select("id, workspace_id, contact_id, instance_id, source_jid, source_id, chat_type")
      .eq("id", b.conversation_id)
      .maybeSingle();
    if (!conv) return jsonError("conversation_not_found", 404);
    const c = conv as {
      id: string;
      workspace_id: string;
      contact_id: string | null;
      instance_id: string;
      source_jid: string | null;
      source_id: string;
      chat_type: "individual" | "group";
    };
    if (c.workspace_id !== b.workspace_id) return jsonError("forbidden", 403);
    if (!c.contact_id) return jsonError("conversation_has_no_contact", 422);
    const remoteJid =
      c.chat_type === "group" ? c.source_jid ?? c.source_id : c.source_id;
    const enrollmentId = await enrollInSequence(admin, {
      workspaceId: b.workspace_id,
      sequenceId: b.sequence_id,
      conversationId: c.id,
      contactId: c.contact_id,
      instanceId: c.instance_id,
      remoteJid,
    });
    if (!enrollmentId) {
      return NextResponse.json({ ok: true, enrolled: false, reason: "inactive_or_duplicate" });
    }
    return NextResponse.json({ ok: true, enrolled: true, enrollment_id: enrollmentId });
  }

  if (!b.name?.trim()) return jsonError("name required", 400);

  let steps = sanitizeSteps(b.steps);
  let exit = b.exit_conditions ?? { on_reply: true };
  if (b.recipe_key && SEQUENCE_RECIPES[b.recipe_key]) {
    const recipe = SEQUENCE_RECIPES[b.recipe_key];
    steps = recipe.steps;
    exit = recipe.exit_conditions;
  }

  const { data, error } = await admin
    .from("whatsapp_sequences")
    .insert({
      workspace_id: b.workspace_id,
      name: b.name.trim(),
      description: b.description ?? null,
      steps,
      exit_conditions: exit,
      recipe_key: b.recipe_key ?? null,
      active: b.active ?? false,
    })
    .select(COLS)
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<SequenceBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.id) return jsonError("id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) patch.name = b.name.trim();
  if (b.description !== undefined) patch.description = b.description;
  if (b.steps !== undefined) patch.steps = sanitizeSteps(b.steps);
  if (b.exit_conditions !== undefined) patch.exit_conditions = b.exit_conditions;
  if (b.active !== undefined) patch.active = !!b.active;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_sequences")
    .update(patch)
    .eq("id", b.id)
    .eq("workspace_id", b.workspace_id)
    .select(COLS)
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
  // Stop active enrollments, then delete the sequence.
  await admin
    .from("whatsapp_sequence_enrollments")
    .update({ status: "exited", next_run_at: null, last_error: "sequence_deleted" })
    .eq("workspace_id", workspaceId)
    .eq("sequence_id", id)
    .eq("status", "active");
  const { error } = await admin
    .from("whatsapp_sequences")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
