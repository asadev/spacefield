"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateWorkflowDefinition,
  type WorkflowDefinition,
} from "@/lib/workflows/types";

import { recordAdminAction } from "../../../_audit";
import { assertAdmin } from "../../../_lib";

/**
 * Server actions for the visual workflow builder.
 *
 * Distinct from app/admin/workflows/_actions.ts which handles the
 * older `agent_workflows` (AI skill orchestration) table. Here we
 * write to `public.workflows` — workspace-scoped automation authored
 * via /admin/workflows/builder.
 *
 * Mutations:
 *   - saveWorkflow      — create or update one row
 *   - deleteWorkflow    — hard delete
 *   - toggleEnabled     — flip the `enabled` flag
 *
 * Every mutation runs assertAdmin() + writes an admin_audit_log row.
 *
 * Note: "use server" files may only export async functions — types
 * for the inputs/outputs live in ./_action_types.ts so the builder
 * client component can import them without violating that rule.
 */

export async function saveWorkflow(input: {
  id?: string;
  workspace_id: string;
  name: string;
  description?: string;
  trigger_kind: "manual" | "schedule" | "event";
  enabled?: boolean;
  definition: WorkflowDefinition;
}): Promise<{ ok: true; id: string } | { ok: false; errors: string[] }> {
  await assertAdmin();

  // Validate the JSON shape before any DB call — return inline errors
  // for the builder to render rather than throwing a 500.
  const errors = validateWorkflowDefinition(input.definition);
  if (errors.length > 0) return { ok: false, errors };

  if (!input.workspace_id || !/^[0-9a-f-]{36}$/i.test(input.workspace_id)) {
    return { ok: false, errors: ["workspace_id must be a UUID"] };
  }

  const admin = createAdminClient();

  const payload = {
    workspace_id: input.workspace_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    trigger_kind: input.trigger_kind,
    enabled: input.enabled ?? true,
    definition: input.definition as unknown as Record<string, unknown>,
  };

  let savedId: string;
  if (input.id && /^[0-9a-f-]{36}$/i.test(input.id)) {
    // Update path.
    const { data: existing } = await admin
      .from("workflows")
      .select("id, definition")
      .eq("id", input.id)
      .maybeSingle();

    const { error } = await admin
      .from("workflows")
      .update(payload)
      .eq("id", input.id);
    if (error) return { ok: false, errors: [error.message] };

    savedId = input.id;
    await recordAdminAction({
      action: "workflow_v2.update",
      targetType: "workflows",
      targetId: savedId,
      before: existing ?? null,
      after: payload,
    });
  } else {
    // Insert path.
    const { data, error } = await admin
      .from("workflows")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, errors: [error?.message ?? "insert failed"] };
    }
    savedId = data.id as string;
    await recordAdminAction({
      action: "workflow_v2.create",
      targetType: "workflows",
      targetId: savedId,
      after: payload,
    });
  }

  revalidatePath("/admin/workflows/builder");
  return { ok: true, id: savedId };
}

export async function deleteWorkflow(id: string): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: "invalid id" };
  }
  const admin = createAdminClient();
  const { data: before } = await admin
    .from("workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("workflows").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAdminAction({
    action: "workflow_v2.delete",
    targetType: "workflows",
    targetId: id,
    before,
  });
  revalidatePath("/admin/workflows/builder");
  return { ok: true };
}

export async function toggleEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid id" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("workflows")
    .update({ enabled })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAdminAction({
    action: "workflow_v2.toggle",
    targetType: "workflows",
    targetId: id,
    metadata: { enabled },
  });
  revalidatePath("/admin/workflows/builder");
  return { ok: true };
}
