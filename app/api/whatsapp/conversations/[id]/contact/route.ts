import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import { memberLabels } from "@/lib/whatsapp/inbox";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Avatar fetch hits Evolution (best-effort, 8s cap) so allow headroom.
export const maxDuration = 30;

/**
 * GET /api/whatsapp/conversations/[id]/contact  (EPIC-07)
 *
 * The contact sidebar bundle for the open conversation:
 *   - conversation: id, title, phone, status, priority, assignee_id, avatar_url,
 *                   custom_attributes, lifecycle_stage
 *   - contact: CRM identity (first/last/email/phone/job_title/company/notes)
 *   - labels: [{id,title,color}] applied to this conversation
 *   - participants: [{id,name}] watchers
 *   - custom_field_defs: definitions for model='conversation'
 *   - activity: recent messages (last 8, incl. private notes) for a timeline
 *
 * Avatar is cached into whatsapp_conversations.avatar_url on first fetch via
 * Evolution fetchProfilePictureUrl (best-effort — never blocks the response
 * on failure; ?refresh_avatar=1 forces a re-fetch).
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id: conversationId } = await ctx.params;
  if (!conversationId) return jsonError("id required", 400);

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const refreshAvatar = sp.get("refresh_avatar") === "1";

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: conv, error: convErr } = await admin
    .from("whatsapp_conversations")
    .select(
      "id, workspace_id, instance_id, contact_id, source_id, source_jid, title, chat_type, avatar_url, status, priority, assignee_id, custom_attributes, last_message_at, first_reply_at, created_at",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return jsonError(convErr.message, 500);
  if (!conv) return jsonError("not_found", 404);
  const c = conv as {
    id: string;
    workspace_id: string;
    instance_id: string;
    contact_id: string | null;
    source_id: string;
    source_jid: string | null;
    title: string | null;
    chat_type: "individual" | "group";
    avatar_url: string | null;
    status: number;
    priority: number;
    assignee_id: string | null;
    custom_attributes: Record<string, unknown> | null;
    last_message_at: string | null;
    first_reply_at: string | null;
    created_at: string;
  };
  if (c.workspace_id !== workspaceId) return jsonError("forbidden", 403);

  const custom = (c.custom_attributes && typeof c.custom_attributes === "object"
    ? c.custom_attributes
    : {}) as Record<string, unknown>;
  const lifecycleStage =
    typeof custom.lifecycle_stage === "string" ? custom.lifecycle_stage : null;

  // ── CRM contact identity ──
  let contact: Record<string, unknown> | null = null;
  if (c.contact_id) {
    const { data: ct } = await admin
      .from("crm_contacts")
      .select(
        "id, first_name, last_name, email, phone, job_title, company_id, notes, custom",
      )
      .eq("id", c.contact_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (ct) {
      contact = ct as Record<string, unknown>;
      // company name (best-effort)
      const companyId = (ct as { company_id: string | null }).company_id;
      if (companyId) {
        const { data: company } = await admin
          .from("crm_companies")
          .select("name")
          .eq("id", companyId)
          .maybeSingle();
        if (company) contact.company_name = (company as { name: string }).name;
      }
    }
  }

  // ── labels on this conversation ──
  const { data: tags } = await admin
    .from("whatsapp_taggings")
    .select("label_id")
    .eq("workspace_id", workspaceId)
    .eq("taggable_type", "conversation")
    .eq("taggable_id", conversationId);
  const labelIds = (tags ?? []).map((t) => (t as { label_id: string }).label_id);
  let labels: Array<{ id: string; title: string; color: string }> = [];
  if (labelIds.length > 0) {
    const { data: labelRows } = await admin
      .from("whatsapp_labels")
      .select("id, title, color")
      .eq("workspace_id", workspaceId)
      .in("id", labelIds);
    labels = (labelRows ?? []) as Array<{ id: string; title: string; color: string }>;
  }

  // ── participants ──
  const { data: partRows } = await admin
    .from("whatsapp_conversation_participants")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("conversation_id", conversationId);
  const participantIds = (partRows ?? []).map((p) => (p as { user_id: string }).user_id);
  const assigneeIds = c.assignee_id ? [c.assignee_id] : [];
  const labelsForUsers = await memberLabels(admin, [...participantIds, ...assigneeIds]);
  const participants = participantIds.map((id) => ({
    id,
    name: labelsForUsers.get(id) ?? id.slice(0, 8),
  }));
  const assigneeName = c.assignee_id
    ? labelsForUsers.get(c.assignee_id) ?? c.assignee_id.slice(0, 8)
    : null;

  // ── custom-field definitions (conversation model) ──
  const { data: defs } = await admin
    .from("whatsapp_custom_attribute_definitions")
    .select(
      "id, display_name, attribute_key, attribute_type, attribute_values, position",
    )
    .eq("workspace_id", workspaceId)
    .eq("attribute_model", "conversation")
    .order("position", { ascending: true });

  // ── recent activity timeline (last 8 messages incl. private notes) ──
  const { data: recent } = await admin
    .from("whatsapp_messages")
    .select("id, direction, body, is_private, media_type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(8);
  const activity = (recent ?? []).map((m) => {
    const r = m as {
      id: string;
      direction: "inbound" | "outbound";
      body: string | null;
      is_private: boolean | null;
      media_type: string | null;
      created_at: string;
    };
    return {
      id: r.id,
      direction: r.direction,
      is_private: r.is_private ?? false,
      preview: r.body?.slice(0, 100) ?? (r.media_type ? `[${r.media_type}]` : ""),
      created_at: r.created_at,
    };
  });

  // ── avatar: cached → return; missing/refresh → best-effort fetch + cache ──
  let avatarUrl = c.avatar_url;
  if ((refreshAvatar || !avatarUrl) && c.chat_type === "individual") {
    try {
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("evolution_instance_name")
        .eq("id", c.instance_id)
        .maybeSingle();
      const instanceName = (inst as { evolution_instance_name?: string } | null)
        ?.evolution_instance_name;
      const numberOrJid = c.source_jid ?? c.source_id;
      if (instanceName && numberOrJid) {
        const client = getEvolutionClient();
        const fetched = await client.fetchProfilePictureUrl(instanceName, numberOrJid);
        if (fetched) {
          avatarUrl = fetched;
          await admin
            .from("whatsapp_conversations")
            .update({ avatar_url: fetched })
            .eq("id", conversationId);
        }
      }
    } catch {
      // best-effort — sidebar still renders with initials
    }
  }

  return NextResponse.json({
    conversation: {
      id: c.id,
      title: c.title,
      phone: c.source_id,
      chat_type: c.chat_type,
      avatar_url: avatarUrl,
      status: c.status,
      priority: c.priority,
      assignee_id: c.assignee_id,
      assignee_name: assigneeName,
      custom_attributes: custom,
      lifecycle_stage: lifecycleStage,
      last_message_at: c.last_message_at,
      first_reply_at: c.first_reply_at,
      created_at: c.created_at,
    },
    contact,
    labels,
    participants,
    custom_field_defs: defs ?? [],
    activity,
  });
}
