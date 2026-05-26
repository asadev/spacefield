import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CreateGroupBody {
  workspace_id?: string;
  name?: string;
  contact_ids?: string[];
}

/**
 * GET /api/whatsapp/groups?workspace_id=...
 * Returns the workspace's known groups. Refreshes from Evolution on
 * demand so newly-created/joined groups appear without a separate cron.
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
  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Best-effort: re-sync from Evolution if we have a connected instance.
  if (instRow) {
    const inst = instRow as WhatsAppInstanceRow;
    try {
      const client = getEvolutionClient();
      const remote = await client.fetchGroups(inst.evolution_instance_name);
      for (const g of remote) {
        await admin
          .from("whatsapp_groups")
          .upsert(
            {
              workspace_id: workspaceId,
              instance_id: inst.id,
              evolution_group_id: g.id,
              name: g.subject,
              member_count: g.size ?? 0,
              members_synced_at: new Date().toISOString(),
            },
            { onConflict: "instance_id,evolution_group_id" },
          );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        "[whatsapp.groups] evolution fetch failed (continuing with cache):",
        e,
      );
    }
  }

  const { data: rows, error } = await admin
    .from("whatsapp_groups")
    .select("id, name, evolution_group_id, member_count, members_synced_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: rows ?? [] });
}

/**
 * POST /api/whatsapp/groups — create a new group on Evolution from
 * CRM contact ids.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const body = await readJson<CreateGroupBody>(req);
  if (!body.ok) return body.response;

  const workspaceId = body.body.workspace_id;
  const name = body.body.name?.trim();
  const contactIds = body.body.contact_ids ?? [];
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!name) return jsonError("name required", 400);
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return jsonError("contact_ids required", 400);
  }

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!instRow) return jsonError("no_connected_instance", 409);
  const inst = instRow as WhatsAppInstanceRow;

  const { data: contacts, error: cErr } = await admin
    .from("crm_contacts")
    .select("id, phone")
    .eq("workspace_id", workspaceId)
    .in("id", contactIds);
  if (cErr) return jsonError(cErr.message, 500);

  const participants = (contacts ?? [])
    .map((c) => (c as { phone: string | null }).phone)
    .filter((p): p is string => !!p && p.replace(/\D/g, "").length > 0)
    .map((p) => p.replace(/\D/g, ""));

  if (participants.length === 0) {
    return jsonError("no_contacts_with_phone", 422);
  }

  try {
    const client = getEvolutionClient();
    const grp = await client.createGroup(
      inst.evolution_instance_name,
      name,
      participants,
    );
    const { data: row, error: insErr } = await admin
      .from("whatsapp_groups")
      .upsert(
        {
          workspace_id: workspaceId,
          instance_id: inst.id,
          evolution_group_id: grp.id,
          name: grp.subject,
          member_count: grp.size ?? participants.length,
          members_synced_at: new Date().toISOString(),
        },
        { onConflict: "instance_id,evolution_group_id" },
      )
      .select("*")
      .single();
    if (insErr) return jsonError(insErr.message, 500);
    return NextResponse.json({ item: row });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "create_failed";
    return jsonError(errMsg, 502);
  }
}

/**
 * DELETE /api/whatsapp/groups?id=...&workspace_id=...
 *
 * Removes the row from our local cache. Does NOT delete the group on
 * Evolution / WhatsApp — that's an explicit user action on the shop
 * phone for safety.
 */
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
    .from("whatsapp_groups")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
