"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

/**
 * Force-clear a pending agent approval. The runtime normally clears
 * these on user "YES"/"NO" reply or natural expiry; this is the admin
 * escape hatch for stuck or abandoned approvals.
 *
 * Audit-logged. Only mutation in the entire /admin/logs surface.
 */
export async function forceClearApproval(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  // Read the row first so we have a meaningful `before` snapshot for
  // the audit log. If the row's already gone, exit quietly.
  const { data: existing, error: readErr } = await admin
    .from("agent_pending_approvals")
    .select(
      "id, workspace_id, user_id, channel, skill_id, tool_name, summary, expires_at, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) {
    revalidatePath("/admin/logs");
    return;
  }

  const { error: delErr } = await admin
    .from("agent_pending_approvals")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(delErr.message);

  await recordAdminAction({
    action: "agent.approval_clear",
    targetType: "approval",
    targetId: id,
    before: existing,
    metadata: {
      workspace_id: existing.workspace_id,
      user_id: existing.user_id,
      skill_id: existing.skill_id,
      tool_name: existing.tool_name,
    },
  });

  revalidatePath("/admin/logs");
}
