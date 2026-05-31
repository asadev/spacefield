import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import { WORKFLOW_RECIPES } from "@/lib/whatsapp/workflow-recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp workflows (EPIC-19) — a friendlier authoring surface over the proven
 * automation engine. A workflow stores a `graph` jsonb produced by the step-list
 * builder: { trigger, conditions, actions[] }. To avoid a PARALLEL runtime, an
 * ACTIVE workflow is compiled into a backing whatsapp_automation_rules row
 * (linked by recipe='wf:<workflow_id>') so the existing inbound automation pass
 * executes it through the shared action executor (throttle + consent baked in).
 *
 * GET    /api/whatsapp/workflows?workspace_id=[&recipes=1]   → { items, recipes? }
 * POST   /api/whatsapp/workflows  { workspace_id, name, graph?, recipe_key? }
 * PATCH  /api/whatsapp/workflows  { workspace_id, id, name?, graph?, active? }
 * DELETE /api/whatsapp/workflows?workspace_id=&id=
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

const COLS =
  "id, name, description, trigger, graph, recipe_key, active, created_at, updated_at";

// Action types a workflow may reference (superset of automation + Wave-5 verbs).
const WF_ACTION_TYPES = new Set([
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
const WF_EVENTS = new Set(["conversation_created", "message_created"]);

interface WorkflowGraph {
  trigger?: string;
  conditions?: Record<string, unknown>;
  actions?: Array<{ type?: string; params?: Record<string, unknown> }>;
  nodes?: unknown[];
  edges?: unknown[];
}

function sanitizeActions(
  raw: WorkflowGraph["actions"],
): Array<{ type: string; params: Record<string, unknown> }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ type: string; params: Record<string, unknown> }> = [];
  for (const a of raw) {
    const type = a?.type;
    if (typeof type === "string" && WF_ACTION_TYPES.has(type)) {
      out.push({ type, params: (a?.params as Record<string, unknown>) ?? {} });
    }
  }
  return out;
}

/**
 * Sync the backing automation rule for a workflow. When the workflow is active
 * with at least one valid action, upsert a rule; otherwise remove it. Keyed by
 * recipe='wf:<id>'. Best-effort — failures don't block the workflow write.
 */
async function syncBackingRule(
  admin: ReturnType<typeof createAdminClient>,
  wf: {
    id: string;
    workspace_id: string;
    name: string;
    trigger: string;
    graph: WorkflowGraph;
    active: boolean;
    created_by: string | null;
  },
) {
  const tag = `wf:${wf.id}`;
  const actions = sanitizeActions(wf.graph?.actions);
  const eventName = WF_EVENTS.has(wf.trigger) ? wf.trigger : "message_created";

  // Always clear any prior backing rule for this workflow.
  await admin
    .from("whatsapp_automation_rules")
    .delete()
    .eq("workspace_id", wf.workspace_id)
    .eq("recipe", tag);

  if (!wf.active || actions.length === 0) return;

  await admin.from("whatsapp_automation_rules").insert({
    workspace_id: wf.workspace_id,
    name: wf.name,
    event_name: eventName,
    conditions: (wf.graph?.conditions as Record<string, unknown>) ?? {},
    actions,
    active: true,
    priority: 50, // workflows run a touch before ad-hoc rules
    stop_on_match: true,
    recipe: tag,
    created_by: wf.created_by,
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
    .from("whatsapp_workflows")
    .select(COLS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) return jsonError(error.message, 500);

  const body: Record<string, unknown> = { items: data ?? [] };
  if (sp.get("recipes")) body.recipes = WORKFLOW_RECIPES;
  return NextResponse.json(body);
}

interface WorkflowBody {
  workspace_id?: string;
  id?: string;
  name?: string;
  description?: string | null;
  trigger?: string;
  graph?: WorkflowGraph;
  recipe_key?: string;
  active?: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<WorkflowBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.name?.trim()) return jsonError("name required", 400);
  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  // Clone a recipe template if requested and no explicit graph given.
  let graph: WorkflowGraph = b.graph ?? { trigger: "message_created", conditions: {}, actions: [] };
  let trigger = b.trigger ?? graph.trigger ?? "message_created";
  if (b.recipe_key && WORKFLOW_RECIPES[b.recipe_key]) {
    const recipe = WORKFLOW_RECIPES[b.recipe_key];
    graph = recipe.graph;
    trigger = recipe.graph.trigger ?? "message_created";
  }
  if (!WF_EVENTS.has(trigger)) trigger = "message_created";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_workflows")
    .insert({
      workspace_id: b.workspace_id,
      name: b.name.trim(),
      description: b.description ?? null,
      trigger,
      graph,
      recipe_key: b.recipe_key ?? null,
      active: b.active ?? false,
    })
    .select(COLS)
    .single();
  if (error) return jsonError(error.message, 500);

  const wf = data as {
    id: string;
    name: string;
    trigger: string;
    graph: WorkflowGraph;
    active: boolean;
  };
  await syncBackingRule(admin, {
    id: wf.id,
    workspace_id: b.workspace_id,
    name: wf.name,
    trigger: wf.trigger,
    graph: wf.graph,
    active: wf.active,
    created_by: auth.user.id,
  });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<WorkflowBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.id) return jsonError("id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) patch.name = b.name.trim();
  if (b.description !== undefined) patch.description = b.description;
  if (b.graph !== undefined) patch.graph = b.graph;
  if (b.trigger !== undefined)
    patch.trigger = WF_EVENTS.has(b.trigger) ? b.trigger : "message_created";
  if (b.active !== undefined) patch.active = !!b.active;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_workflows")
    .update(patch)
    .eq("id", b.id)
    .eq("workspace_id", b.workspace_id)
    .select(COLS)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("not_found", 404);

  const wf = data as {
    id: string;
    name: string;
    trigger: string;
    graph: WorkflowGraph;
    active: boolean;
  };
  await syncBackingRule(admin, {
    id: wf.id,
    workspace_id: b.workspace_id,
    name: wf.name,
    trigger: wf.trigger,
    graph: wf.graph,
    active: wf.active,
    created_by: auth.user.id,
  });
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
  // Remove backing rule first, then the workflow.
  await admin
    .from("whatsapp_automation_rules")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("recipe", `wf:${id}`);
  const { error } = await admin
    .from("whatsapp_workflows")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
