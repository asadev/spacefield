import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
  requireWorkspaceOwnerOrAdmin,
} from "@/lib/whatsapp/_route-helpers";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Evolution group calls hit the shop phone; allow headroom.
export const maxDuration = 60;

/**
 * Group management (EPIC-10). `[id]` is a whatsapp_groups row id.
 *
 * GET  /api/whatsapp/groups/[id]?workspace_id=
 *   → full group info incl. live participants (+ admin flags), refreshed from
 *     Evolution and mirrored into the row (participants jsonb, description,
 *     is_announce, is_locked, last_synced_at). Members can read.
 *
 * POST /api/whatsapp/groups/[id]   { workspace_id, action, ... }
 *   action ∈ add_participants | remove_participants | promote | demote |
 *            update_subject | update_description | update_picture |
 *            set_announce | set_locked | leave | invite_code | revoke_invite
 *   Mutating actions require owner/admin (they touch the shared shop phone +
 *   the live WhatsApp group). "invite-only" / "not-admin" Evolution failures
 *   come back as { ok:false, error } with HTTP 502 + the upstream text so the
 *   UI can show a friendly "couldn't add (group is invite-only)" message.
 *
 * Auth (GET): requireUser -> requirePro -> requireWorkspaceMember + ownership.
 * Auth (POST mutations): + requireWorkspaceOwnerOrAdmin.
 */

interface GroupActionBody {
  workspace_id?: string;
  action?: string;
  participants?: string[]; // E164 digits
  subject?: string;
  description?: string;
  image?: string; // URL or base64
  value?: boolean; // for set_announce / set_locked
}

async function loadGroup(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  workspaceId: string,
): Promise<
  | {
      ok: true;
      group: {
        id: string;
        evolution_group_id: string;
        instance_id: string;
      };
      instance: WhatsAppInstanceRow;
    }
  | { ok: false; response: Response }
> {
  const { data: grp } = await admin
    .from("whatsapp_groups")
    .select("id, evolution_group_id, instance_id, workspace_id")
    .eq("id", id)
    .maybeSingle();
  if (!grp) return { ok: false, response: jsonError("not_found", 404) };
  const g = grp as {
    id: string;
    evolution_group_id: string;
    instance_id: string;
    workspace_id: string;
  };
  if (g.workspace_id !== workspaceId) {
    return { ok: false, response: jsonError("forbidden", 403) };
  }
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("id", g.instance_id)
    .maybeSingle();
  if (!inst) return { ok: false, response: jsonError("no_instance", 409) };
  return {
    ok: true,
    group: { id: g.id, evolution_group_id: g.evolution_group_id, instance_id: g.instance_id },
    instance: inst as WhatsAppInstanceRow,
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id } = await ctx.params;
  if (!id) return jsonError("id required", 400);
  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const loaded = await loadGroup(admin, id, workspaceId);
  if (!loaded.ok) return loaded.response;
  const { group, instance } = loaded;

  // Live fetch participants + metadata; mirror into the row. Best-effort:
  // if Evolution is slow/unavailable we still return the cached row.
  const { data: cached } = await admin
    .from("whatsapp_groups")
    .select(
      "id, name, evolution_group_id, member_count, description, avatar_url, owner_jid, is_announce, is_locked, invite_code, participants, members_synced_at, last_synced_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  let live: Awaited<ReturnType<typeof fetchLive>> = null;
  try {
    live = await fetchLive(instance.evolution_instance_name, group.evolution_group_id);
  } catch {
    live = null;
  }

  if (live) {
    const patch = {
      name: live.subject ?? (cached as { name?: string } | null)?.name ?? null,
      description: live.description,
      avatar_url: live.pictureUrl,
      owner_jid: live.owner,
      is_announce: live.isAnnounce ?? false,
      is_locked: live.isLocked ?? false,
      participants: live.participants,
      member_count: live.participants.length,
      last_synced_at: new Date().toISOString(),
      members_synced_at: new Date().toISOString(),
    };
    await admin.from("whatsapp_groups").update(patch).eq("id", id);
    return NextResponse.json({ item: { ...(cached ?? {}), ...patch, id } });
  }

  return NextResponse.json({ item: cached ?? null, stale: true });
}

async function fetchLive(instanceName: string, groupJid: string) {
  const client = getEvolutionClient();
  return client.fetchGroupParticipants(instanceName, groupJid);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id } = await ctx.params;
  if (!id) return jsonError("id required", 400);

  const parsed = await readJson<GroupActionBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  const workspaceId = b.workspace_id;
  const action = b.action;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!action) return jsonError("action required", 400);

  // Mutations touch the shared shop phone + the live group → owner/admin only.
  const admin = createAdminClient();
  const loadedMember = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!loadedMember.ok) return loadedMember.response;

  // invite_code is read-only-ish (fetch the current link); everything else is a
  // mutation requiring owner/admin.
  if (action !== "invite_code") {
    const adminGate = await requireWorkspaceOwnerOrAdmin(auth.supabase, workspaceId);
    if (!adminGate.ok) return adminGate.response;
  }

  const loaded = await loadGroup(admin, id, workspaceId);
  if (!loaded.ok) return loaded.response;
  const { group, instance } = loaded;
  const client = getEvolutionClient();
  const inst = instance.evolution_instance_name;
  const jid = group.evolution_group_id;

  // Normalise participants to digits.
  const parts = Array.isArray(b.participants)
    ? b.participants
        .map((p) => String(p).replace(/\D/g, ""))
        .filter((p) => p.length > 0)
    : [];

  try {
    switch (action) {
      case "add_participants": {
        if (parts.length === 0) return jsonError("participants required", 400);
        await client.addGroupParticipants(inst, jid, parts);
        break;
      }
      case "remove_participants": {
        if (parts.length === 0) return jsonError("participants required", 400);
        await client.removeGroupParticipants(inst, jid, parts);
        break;
      }
      case "promote": {
        if (parts.length === 0) return jsonError("participants required", 400);
        await client.promoteGroupParticipants(inst, jid, parts);
        break;
      }
      case "demote": {
        if (parts.length === 0) return jsonError("participants required", 400);
        await client.demoteGroupParticipants(inst, jid, parts);
        break;
      }
      case "update_subject": {
        if (!b.subject?.trim()) return jsonError("subject required", 400);
        await client.updateGroupSubject(inst, jid, b.subject.trim());
        await admin.from("whatsapp_groups").update({ name: b.subject.trim() }).eq("id", id);
        break;
      }
      case "update_description": {
        await client.updateGroupDescription(inst, jid, b.description ?? "");
        await admin
          .from("whatsapp_groups")
          .update({ description: b.description ?? null })
          .eq("id", id);
        break;
      }
      case "update_picture": {
        if (!b.image?.trim()) return jsonError("image required", 400);
        await client.updateGroupPicture(inst, jid, b.image.trim());
        break;
      }
      case "set_announce": {
        await client.updateGroupSetting(
          inst,
          jid,
          b.value ? "announcement" : "not_announcement",
        );
        await admin
          .from("whatsapp_groups")
          .update({ is_announce: !!b.value })
          .eq("id", id);
        break;
      }
      case "set_locked": {
        await client.updateGroupSetting(inst, jid, b.value ? "locked" : "unlocked");
        await admin
          .from("whatsapp_groups")
          .update({ is_locked: !!b.value })
          .eq("id", id);
        break;
      }
      case "leave": {
        await client.leaveGroup(inst, jid);
        // Drop the local cache row — we're no longer in the group.
        await admin.from("whatsapp_groups").delete().eq("id", id);
        return NextResponse.json({ ok: true, left: true });
      }
      case "invite_code": {
        const code = await client.fetchGroupInviteCode(inst, jid);
        if (code) await admin.from("whatsapp_groups").update({ invite_code: code }).eq("id", id);
        return NextResponse.json({
          ok: true,
          invite_code: code,
          invite_url: code ? `https://chat.whatsapp.com/${code}` : null,
        });
      }
      case "revoke_invite": {
        const code = await client.revokeGroupInviteCode(inst, jid);
        await admin
          .from("whatsapp_groups")
          .update({ invite_code: code ?? null })
          .eq("id", id);
        return NextResponse.json({
          ok: true,
          invite_code: code,
          invite_url: code ? `https://chat.whatsapp.com/${code}` : null,
        });
      }
      default:
        return jsonError("unknown_action", 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "group_action_failed";
    // eslint-disable-next-line no-console
    console.error("[whatsapp.groups] action failed", action, msg);
    return jsonError(msg, 502);
  }

  // Re-sync participants into the row after a membership/setting change so the
  // UI reflects the new state without a second round trip.
  try {
    const live = await fetchLive(inst, jid);
    if (live) {
      await admin
        .from("whatsapp_groups")
        .update({
          participants: live.participants,
          member_count: live.participants.length,
          is_announce: live.isAnnounce ?? false,
          is_locked: live.isLocked ?? false,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true });
}
