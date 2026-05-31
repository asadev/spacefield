import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Auto-assignment (Wave 5, EPIC-20). When a NEW conversation arrives on an
 * instance with auto_assign_enabled, pick an available agent and assign it.
 *
 * Strategy is server-side + cheap. The whatsapp_pick_assignee RPC selects the
 * team member with the lowest active_count that is under capacity and not
 * offline, and atomically bumps their active_count — so a single RPC is
 * simultaneously:
 *   - round-robin  (lowest current load picked first)
 *   - capacity-aware (active_count < capacity)
 *   - presence-aware (skips presence='offline')
 *
 * Default OFF — manual single-assignee (Wave 2) stays the baseline. No-ops
 * gracefully when the instance has no team / no available agent, and never
 * overwrites an existing assignee. Best-effort; called from the webhook and
 * never throws into it.
 */
export async function autoAssignConversation(
  admin: Admin,
  params: { conversationId: string; instanceId: string },
): Promise<string | null> {
  try {
    // Already assigned? leave it.
    const { data: conv } = await admin
      .from("whatsapp_conversations")
      .select("assignee_id")
      .eq("id", params.conversationId)
      .maybeSingle();
    if (!conv) return null;
    const existing = (conv as { assignee_id: string | null }).assignee_id;
    if (existing) return existing;

    // Instance auto-assign config.
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("auto_assign_enabled, auto_assign_team_id")
      .eq("id", params.instanceId)
      .maybeSingle();
    const cfg = inst as {
      auto_assign_enabled: boolean | null;
      auto_assign_team_id: string | null;
    } | null;
    if (!cfg?.auto_assign_enabled || !cfg.auto_assign_team_id) return null;

    const { data: picked } = await admin.rpc("whatsapp_pick_assignee", {
      p_team_id: cfg.auto_assign_team_id,
    });
    const userId = (picked as string | null) ?? null;
    if (!userId) return null;

    await admin
      .from("whatsapp_conversations")
      .update({ assignee_id: userId })
      .eq("id", params.conversationId);
    await admin
      .from("whatsapp_instances")
      .update({ last_assigned_user_id: userId })
      .eq("id", params.instanceId);
    return userId;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp.assign] autoAssignConversation failed:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}
