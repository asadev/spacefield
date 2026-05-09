"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { AgentToolOverrideRow } from "../_types";

/**
 * Server actions for the Tools Catalog override editor.
 *
 *   setToolOverride   — upsert one row in `agent_tool_overrides`.
 *   clearToolOverride — delete that row.
 *
 * Both write an `admin_audit_log` entry via `recordAdminAction`. The
 * `agent_tool_overrides` table requires (agent_id, skill_id, tool_name)
 * to all be non-null, and `agent_id` is a foreign key to `ai_agents`,
 * so the agent must exist before its override can be saved. The form
 * handler surfaces FK errors as a regular thrown Error.
 */

const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;

function pickBoolOrNull(raw: unknown): boolean | null {
  const v = String(raw ?? "").trim();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

interface OverrideKey {
  agent_id: string;
  skill_id: string;
  tool_name: string;
}

function readKey(formData: FormData): OverrideKey {
  const agent_id = String(formData.get("agent_id") ?? "").trim();
  const skill_id = String(formData.get("skill_id") ?? "").trim();
  const tool_name = String(formData.get("tool_name") ?? "").trim();
  if (!agent_id) throw new Error("missing agent_id");
  if (!skill_id) throw new Error("missing skill_id");
  if (!tool_name) throw new Error("missing tool_name");
  if (!TOOL_NAME_RE.test(tool_name)) {
    throw new Error(
      `tool_name "${tool_name}" must be snake_case (lowercase letters/digits/underscore, start with a letter)`
    );
  }
  return { agent_id, skill_id, tool_name };
}

function paths(source: string, id: string): string[] {
  return [
    "/admin/tools-catalog",
    `/admin/tools-catalog/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
  ];
}

/* ────────────────────── setToolOverride ────────────────────── */

export async function setToolOverride(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const key = readKey(formData);

  // Read fields. Empty description input clears the override field
  // (writes null), letting the admin "untick" a column without
  // deleting the entire row.
  const descRaw = String(formData.get("override_description") ?? "");
  const override_description = descRaw.trim() === "" ? null : descRaw;
  const read_only_override = pickBoolOrNull(formData.get("read_only_override"));
  const requires_confirmation_override = pickBoolOrNull(
    formData.get("requires_confirmation_override")
  );
  const enabledRaw = formData.get("enabled");
  const enabled = enabledRaw == null ? true : String(enabledRaw) === "true";

  // Source/id used only for revalidation paths.
  const source = String(formData.get("source") ?? "skill-custom");
  const idForPath = String(formData.get("id_for_path") ?? key.tool_name);

  const admin = createAdminClient();

  // Read existing row (if any) to capture before-state for audit.
  const { data: beforeRow } = await admin
    .from("agent_tool_overrides")
    .select("*")
    .eq("agent_id", key.agent_id)
    .eq("skill_id", key.skill_id)
    .eq("tool_name", key.tool_name)
    .maybeSingle();

  const upsertRow = {
    agent_id: key.agent_id,
    skill_id: key.skill_id,
    tool_name: key.tool_name,
    override_description,
    // override_input_schema is left untouched here — the per-tool UI
    // doesn't expose schema editing yet (the contract calls for desc/
    // read_only/requires_confirmation only).
    read_only_override,
    requires_confirmation_override,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: afterRow, error } = await admin
    .from("agent_tool_overrides")
    .upsert(upsertRow, { onConflict: "agent_id,skill_id,tool_name" })
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "tool.override_set",
    targetType: "agent_tool_override",
    targetId: `${key.agent_id}:${key.skill_id}:${key.tool_name}`,
    before: (beforeRow as AgentToolOverrideRow | null) ?? null,
    after: afterRow ?? upsertRow,
    metadata: {
      agent_id: key.agent_id,
      skill_id: key.skill_id,
      tool_name: key.tool_name,
    },
  });

  for (const p of paths(source, idForPath)) revalidatePath(p);
}

/* ────────────────────── clearToolOverride ────────────────────── */

export async function clearToolOverride(formData: FormData): Promise<void> {
  await assertAdmin();
  const key = readKey(formData);

  const source = String(formData.get("source") ?? "skill-custom");
  const idForPath = String(formData.get("id_for_path") ?? key.tool_name);

  const admin = createAdminClient();

  const { data: beforeRow } = await admin
    .from("agent_tool_overrides")
    .select("*")
    .eq("agent_id", key.agent_id)
    .eq("skill_id", key.skill_id)
    .eq("tool_name", key.tool_name)
    .maybeSingle();

  if (!beforeRow) {
    // No-op: nothing to clear. Don't throw — the UI doesn't always
    // know the row's state.
    return;
  }

  const { error } = await admin
    .from("agent_tool_overrides")
    .delete()
    .eq("agent_id", key.agent_id)
    .eq("skill_id", key.skill_id)
    .eq("tool_name", key.tool_name);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "tool.override_clear",
    targetType: "agent_tool_override",
    targetId: `${key.agent_id}:${key.skill_id}:${key.tool_name}`,
    before: beforeRow as AgentToolOverrideRow,
    metadata: {
      agent_id: key.agent_id,
      skill_id: key.skill_id,
      tool_name: key.tool_name,
    },
  });

  for (const p of paths(source, idForPath)) revalidatePath(p);
}
