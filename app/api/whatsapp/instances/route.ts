import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getInstanceSendStats } from "@/lib/whatsapp/throttle";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
  requireWorkspaceOwnerOrAdmin,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp instances (EPIC-20) — multiple Evolution lines per workspace.
 * The legacy single-line connect flow lives under /api/whatsapp/instance/*;
 * this route lists every line and edits per-line routing + auto-assignment.
 *
 * GET   /api/whatsapp/instances?workspace_id=          → { items:[{...,stats}] }
 * POST  /api/whatsapp/instances  { workspace_id, label?, role? }  (owner/admin)
 *         create a NEW line (the actual Evolution create/QR happens via the
 *         existing /api/whatsapp/instance/create against the new instance).
 * PATCH /api/whatsapp/instances  { workspace_id, instance_id, label?, role?,
 *         is_default?, auto_assign_enabled?, auto_assign_strategy?,
 *         auto_assign_team_id? }  (owner/admin)
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember (GET) /
 *       requireWorkspaceOwnerOrAdmin (POST/PATCH).
 */

const INSTANCE_COLS =
  "id, evolution_instance_name, phone_number, status, label, role, is_default, auto_assign_enabled, auto_assign_strategy, auto_assign_team_id, paired_at, last_seen_at, created_at";

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
    .from("whatsapp_instances")
    .select(INSTANCE_COLS)
    .eq("workspace_id", workspaceId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message, 500);

  // Attach lightweight send stats per instance (sequential — at most a couple).
  const items = [] as Array<Record<string, unknown>>;
  for (const row of (data ?? []) as Array<{ id: string } & Record<string, unknown>>) {
    let stats: Awaited<ReturnType<typeof getInstanceSendStats>> | null = null;
    try {
      stats = await getInstanceSendStats(row.id);
    } catch {
      stats = null;
    }
    items.push({
      ...row,
      sent_today: stats?.sent_last_day ?? 0,
      sent_this_hour: stats?.sent_last_hour ?? 0,
      daily_cap: stats?.daily_cap ?? null,
      warmup_day: stats?.warmup_age_days ?? null,
    });
  }
  return NextResponse.json({ items });
}

interface InstanceBody {
  workspace_id?: string;
  instance_id?: string;
  label?: string;
  role?: string;
  is_default?: boolean;
  auto_assign_enabled?: boolean;
  auto_assign_strategy?: string;
  auto_assign_team_id?: string | null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<InstanceBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);

  const gate = await requireWorkspaceOwnerOrAdmin(auth.supabase, b.workspace_id);
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  const { count } = await admin
    .from("whatsapp_instances")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", b.workspace_id);
  const existing = count ?? 0;

  const instanceName = `ws_${b.workspace_id.slice(0, 8)}_${Date.now()}`;
  const { data, error } = await admin
    .from("whatsapp_instances")
    .insert({
      workspace_id: b.workspace_id,
      evolution_instance_name: instanceName,
      status: "pending",
      label: b.label?.trim() || null,
      role: b.role?.trim() || "general",
      is_default: existing === 0,
      created_by: auth.user.id,
    })
    .select(INSTANCE_COLS)
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<InstanceBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.instance_id) return jsonError("instance_id required", 400);

  const gate = await requireWorkspaceOwnerOrAdmin(auth.supabase, b.workspace_id);
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  // Ownership: instance must belong to this workspace.
  const { data: own } = await admin
    .from("whatsapp_instances")
    .select("id")
    .eq("id", b.instance_id)
    .eq("workspace_id", b.workspace_id)
    .maybeSingle();
  if (!own) return jsonError("instance_not_in_workspace", 403);

  const patch: Record<string, unknown> = {};
  if (b.label !== undefined) patch.label = b.label?.trim() || null;
  if (b.role !== undefined) patch.role = b.role?.trim() || "general";
  if (b.auto_assign_enabled !== undefined)
    patch.auto_assign_enabled = !!b.auto_assign_enabled;
  if (b.auto_assign_strategy !== undefined)
    patch.auto_assign_strategy = b.auto_assign_strategy;
  if (b.auto_assign_team_id !== undefined)
    patch.auto_assign_team_id = b.auto_assign_team_id || null;
  if (b.is_default === true) {
    // single default per workspace — clear others first
    await admin
      .from("whatsapp_instances")
      .update({ is_default: false })
      .eq("workspace_id", b.workspace_id);
    patch.is_default = true;
  }
  if (Object.keys(patch).length === 0) return jsonError("no_changes", 400);

  const { data, error } = await admin
    .from("whatsapp_instances")
    .update(patch)
    .eq("id", b.instance_id)
    .eq("workspace_id", b.workspace_id)
    .select(INSTANCE_COLS)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("not_found", 404);
  return NextResponse.json({ item: data });
}
