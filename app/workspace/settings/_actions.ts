"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/* app/workspace/settings/_actions.ts — server actions for the
 * /workspace/settings page.
 *
 *   - requestWorkspaceDeletion → public.request_workspace_deletion
 *   - cancelWorkspaceDeletion  → public.cancel_workspace_deletion
 *
 * The owner-only check is enforced by the RPC (it raises 'only the
 * workspace owner can request deletion' when workspace_role_of != owner).
 * We don't re-check it here — duplication just lets things drift.
 */

export type WorkspaceActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function requestWorkspaceDeletion(
  _prev: WorkspaceActionResult | null,
  formData: FormData
): Promise<WorkspaceActionResult<{ graceUntil: string; workspaceId: string }>> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();
  const expected = String(formData.get("expected") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;

  if (!workspaceId) {
    return { ok: false, error: "Missing workspace." };
  }
  if (!expected) {
    return { ok: false, error: "Workspace name not provided." };
  }
  if (confirm !== expected) {
    return {
      ok: false,
      error: "Type the workspace name exactly to confirm.",
    };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { ok: false, error: "Not signed in." };
  }

  const { data, error } = await supabase.rpc("request_workspace_deletion", {
    p_workspace_id: workspaceId,
    p_reason: reason,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/workspace/settings");
  return { ok: true, graceUntil: String(data), workspaceId };
}

export async function cancelWorkspaceDeletion(
  _prev: WorkspaceActionResult | null,
  formData: FormData
): Promise<WorkspaceActionResult<{ workspaceId: string }>> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  if (!workspaceId) {
    return { ok: false, error: "Missing workspace." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_workspace_deletion", {
    p_workspace_id: workspaceId,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/workspace/settings");
  return { ok: true, workspaceId };
}
