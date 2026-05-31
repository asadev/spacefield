import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
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
 * WhatsApp teams + members (EPIC-20). Teams group agents for capacity-aware,
 * presence-aware, round-robin auto-assignment (the whatsapp_pick_assignee RPC).
 *
 * GET    /api/whatsapp/teams?workspace_id=                 → { items:[{...,members[]}] }
 * POST   /api/whatsapp/teams  { workspace_id, name }                     (owner/admin)
 *        add member: { workspace_id, action:'add_member', team_id, user_id, capacity? }
 *        presence:   { workspace_id, action:'set_presence', team_id?, presence }  (self)
 * PATCH  /api/whatsapp/teams  { workspace_id, id?, name? }               (owner/admin)
 *        member:     { workspace_id, action:'update_member', team_id, user_id, capacity?, presence? }
 * DELETE /api/whatsapp/teams?workspace_id=&id=                           (owner/admin)
 *        remove member: ?workspace_id=&team_id=&user_id=                 (owner/admin)
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember (read + self
 *       presence); requireWorkspaceOwnerOrAdmin for team/member management.
 */

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
  const { data: teams, error } = await admin
    .from("whatsapp_teams")
    .select("id, name, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message, 500);

  const teamIds = (teams ?? []).map((t) => (t as { id: string }).id);
  const membersByTeam = new Map<string, Array<Record<string, unknown>>>();
  if (teamIds.length > 0) {
    const { data: tm } = await admin
      .from("whatsapp_team_members")
      .select("id, team_id, user_id, capacity, presence, active_count")
      .eq("workspace_id", workspaceId)
      .in("team_id", teamIds);
    // Resolve names from profiles (keys on user_id; no email column).
    const userIds = Array.from(
      new Set((tm ?? []).map((r) => (r as { user_id: string }).user_id)),
    );
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await admin
        .from("profiles")
        .select("user_id, full_name, username")
        .in("user_id", userIds);
      for (const p of profs ?? []) {
        const pr = p as { user_id: string; full_name: string | null; username: string | null };
        nameById.set(pr.user_id, pr.full_name?.trim() || pr.username?.trim() || "Member");
      }
    }
    for (const r of tm ?? []) {
      const row = r as { team_id: string; user_id: string } & Record<string, unknown>;
      const list = membersByTeam.get(row.team_id) ?? [];
      list.push({ ...row, name: nameById.get(row.user_id) ?? "Member" });
      membersByTeam.set(row.team_id, list);
    }
  }

  const items = (teams ?? []).map((t) => {
    const team = t as { id: string } & Record<string, unknown>;
    return { ...team, members: membersByTeam.get(team.id) ?? [] };
  });
  return NextResponse.json({ items });
}

interface TeamBody {
  workspace_id?: string;
  id?: string;
  action?: string;
  name?: string;
  team_id?: string;
  user_id?: string;
  capacity?: number;
  presence?: string;
}

const PRESENCE = new Set(["available", "away", "offline"]);

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<TeamBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Self-service presence: any member can set their OWN presence.
  if (b.action === "set_presence") {
    const presence = PRESENCE.has(b.presence ?? "") ? b.presence! : "available";
    const q = admin
      .from("whatsapp_team_members")
      .update({ presence, updated_at: new Date().toISOString() })
      .eq("workspace_id", b.workspace_id)
      .eq("user_id", auth.user.id);
    if (b.team_id) q.eq("team_id", b.team_id);
    const { error } = await q;
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, presence });
  }

  // Everything below is owner/admin.
  const gate = await requireWorkspaceOwnerOrAdmin(auth.supabase, b.workspace_id);
  if (!gate.ok) return gate.response;

  if (b.action === "add_member") {
    if (!b.team_id) return jsonError("team_id required", 400);
    if (!b.user_id) return jsonError("user_id required", 400);
    // Validate the team belongs to the workspace.
    const { data: team } = await admin
      .from("whatsapp_teams")
      .select("id")
      .eq("id", b.team_id)
      .eq("workspace_id", b.workspace_id)
      .maybeSingle();
    if (!team) return jsonError("team_not_in_workspace", 403);
    // Validate the user is a workspace member.
    const { data: wm } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", b.workspace_id)
      .eq("user_id", b.user_id)
      .maybeSingle();
    if (!wm) return jsonError("user_not_workspace_member", 422);
    const { data, error } = await admin
      .from("whatsapp_team_members")
      .upsert(
        {
          workspace_id: b.workspace_id,
          team_id: b.team_id,
          user_id: b.user_id,
          capacity: typeof b.capacity === "number" ? Math.max(1, b.capacity) : 10,
        },
        { onConflict: "team_id,user_id" },
      )
      .select("id, team_id, user_id, capacity, presence, active_count")
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ item: data });
  }

  // Create team.
  if (!b.name?.trim()) return jsonError("name required", 400);
  const { data, error } = await admin
    .from("whatsapp_teams")
    .insert({ workspace_id: b.workspace_id, name: b.name.trim() })
    .select("id, name, created_at")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: { ...(data as object), members: [] } });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<TeamBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  const gate = await requireWorkspaceOwnerOrAdmin(auth.supabase, b.workspace_id);
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();

  if (b.action === "update_member") {
    if (!b.team_id || !b.user_id) return jsonError("team_id and user_id required", 400);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof b.capacity === "number") patch.capacity = Math.max(1, b.capacity);
    if (b.presence !== undefined)
      patch.presence = PRESENCE.has(b.presence) ? b.presence : "available";
    const { data, error } = await admin
      .from("whatsapp_team_members")
      .update(patch)
      .eq("workspace_id", b.workspace_id)
      .eq("team_id", b.team_id)
      .eq("user_id", b.user_id)
      .select("id, team_id, user_id, capacity, presence, active_count")
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!data) return jsonError("not_found", 404);
    return NextResponse.json({ item: data });
  }

  if (!b.id) return jsonError("id required", 400);
  if (!b.name?.trim()) return jsonError("name required", 400);
  const { data, error } = await admin
    .from("whatsapp_teams")
    .update({ name: b.name.trim(), updated_at: new Date().toISOString() })
    .eq("id", b.id)
    .eq("workspace_id", b.workspace_id)
    .select("id, name, created_at")
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
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const gate = await requireWorkspaceOwnerOrAdmin(auth.supabase, workspaceId);
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();

  // Remove a single member.
  const teamId = sp.get("team_id");
  const userId = sp.get("user_id");
  if (teamId && userId) {
    const { error } = await admin
      .from("whatsapp_team_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("team_id", teamId)
      .eq("user_id", userId);
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  // Delete a team (members cascade via FK-less cleanup here).
  const id = sp.get("id");
  if (!id) return jsonError("id required", 400);
  await admin
    .from("whatsapp_team_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("team_id", id);
  // Detach any instances pointing at this team for auto-assign.
  await admin
    .from("whatsapp_instances")
    .update({ auto_assign_team_id: null, auto_assign_enabled: false })
    .eq("workspace_id", workspaceId)
    .eq("auto_assign_team_id", id);
  const { error } = await admin
    .from("whatsapp_teams")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
