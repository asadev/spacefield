"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { AgentWorkflowRow } from "../_types";

/**
 * Server actions for the Workflows admin UI. Mirrors skills/_actions.ts in
 * shape: every mutation calls assertAdmin(), validates inputs, writes to
 * `public.agent_workflows` via the service-role client, and records an
 * audit row.
 *
 * Audit conventions:
 *   workflow.create, workflow.update, workflow.delete, workflow.status_change,
 *   workflow.step_add, workflow.step_remove, workflow.step_move.
 */

type WorkflowStatus = "live" | "draft" | "disabled";
type WorkflowTriggerKind = "manual" | "event" | "cron";
type WorkflowStepKind = "skill" | "tool" | "branch" | "prompt";

const STATUSES: ReadonlySet<WorkflowStatus> = new Set([
  "live",
  "draft",
  "disabled",
]);
const TRIGGERS: ReadonlySet<WorkflowTriggerKind> = new Set([
  "manual",
  "event",
  "cron",
]);
const STEP_KINDS: ReadonlySet<WorkflowStepKind> = new Set([
  "skill",
  "tool",
  "branch",
  "prompt",
]);

// Workflow ID format: lowercase alphanum + dot + underscore + hyphen.
const WORKFLOW_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

/* ──────────────────── helpers ──────────────────── */

interface NormalizedStep {
  kind: WorkflowStepKind;
  skill_id?: string;
  tool_name?: string;
  prompt_id?: string;
  condition?: string;
  output_var?: string;
}

function pickStatus(raw: unknown): WorkflowStatus {
  const v = String(raw ?? "draft");
  return STATUSES.has(v as WorkflowStatus) ? (v as WorkflowStatus) : "draft";
}

function pickTrigger(raw: unknown): WorkflowTriggerKind {
  const v = String(raw ?? "manual");
  return TRIGGERS.has(v as WorkflowTriggerKind)
    ? (v as WorkflowTriggerKind)
    : "manual";
}

function pickStepKind(raw: unknown): WorkflowStepKind {
  const v = String(raw ?? "skill");
  return STEP_KINDS.has(v as WorkflowStepKind)
    ? (v as WorkflowStepKind)
    : "skill";
}

function normalizeStep(raw: unknown, idx: number): NormalizedStep {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`steps[${idx}]: not an object`);
  }
  const s = raw as Record<string, unknown>;
  const kind = pickStepKind(s.kind);

  const out: NormalizedStep = { kind };
  const skillId = typeof s.skill_id === "string" ? s.skill_id.trim() : "";
  const toolName = typeof s.tool_name === "string" ? s.tool_name.trim() : "";
  const promptId = typeof s.prompt_id === "string" ? s.prompt_id.trim() : "";
  const condition = typeof s.condition === "string" ? s.condition.trim() : "";
  const outputVar = typeof s.output_var === "string" ? s.output_var.trim() : "";

  if (skillId) out.skill_id = skillId;
  if (toolName) out.tool_name = toolName;
  if (promptId) out.prompt_id = promptId;
  if (condition) out.condition = condition;
  if (outputVar) out.output_var = outputVar;

  // Sanity: skill kind needs skill_id, tool kind needs tool_name, prompt
  // kind needs prompt_id, branch kind needs condition.
  if (kind === "skill" && !out.skill_id) {
    throw new Error(`steps[${idx}]: skill step requires skill_id`);
  }
  if (kind === "tool" && !out.tool_name) {
    throw new Error(`steps[${idx}]: tool step requires tool_name`);
  }
  if (kind === "prompt" && !out.prompt_id) {
    throw new Error(`steps[${idx}]: prompt step requires prompt_id`);
  }
  if (kind === "branch" && !out.condition) {
    throw new Error(`steps[${idx}]: branch step requires condition`);
  }

  return out;
}

function parseTriggerConfig(raw: unknown): Record<string, unknown> {
  const text = String(raw ?? "").trim();
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `trigger_config is not valid JSON: ${(e as Error).message}`
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("trigger_config must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

type WorkflowEditPayload = {
  display_name: string;
  description: string;
  status: WorkflowStatus;
  trigger_kind: WorkflowTriggerKind;
  trigger_config: Record<string, unknown>;
};

function readEditPayload(formData: FormData): WorkflowEditPayload {
  const display_name = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = pickStatus(formData.get("status"));
  const trigger_kind = pickTrigger(formData.get("trigger_kind"));
  const trigger_config = parseTriggerConfig(formData.get("trigger_config"));

  return { display_name, description, status, trigger_kind, trigger_config };
}

function diffBefore(row: AgentWorkflowRow | null) {
  if (!row) return null;
  const { created_at: _c, updated_at: _u, updated_by: _b, ...rest } = row;
  void _c;
  void _u;
  void _b;
  return rest;
}

async function readWorkflow(id: string): Promise<AgentWorkflowRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`workflow "${id}" not found`);
  return data as AgentWorkflowRow;
}

function getStepsArray(row: AgentWorkflowRow): NormalizedStep[] {
  if (!Array.isArray(row.steps)) return [];
  return row.steps.map((s, i) => normalizeStep(s, i));
}

async function writeWorkflowSteps(
  id: string,
  steps: NormalizedStep[],
  actorId: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("agent_workflows")
    .update({
      steps,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/* ──────────────────── createWorkflow ──────────────────── */

export async function createWorkflow(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (id.length > 64) throw new Error("id must be ≤ 64 characters");
  if (!WORKFLOW_ID_RE.test(id)) {
    throw new Error(
      "id must be lowercase letters/digits/dot/underscore/hyphen (start alphanum)"
    );
  }

  const payload = readEditPayload(formData);
  if (!payload.display_name) throw new Error("missing display_name");

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("agent_workflows")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) throw new Error(`workflow id "${id}" already exists`);

  const insertRow = {
    id,
    display_name: payload.display_name,
    description: payload.description,
    steps: [],
    trigger_kind: payload.trigger_kind,
    trigger_config: payload.trigger_config,
    status: payload.status,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await admin
    .from("agent_workflows")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workflow.create",
    targetType: "agent_workflow",
    targetId: id,
    after: diffBefore(inserted as AgentWorkflowRow | null) ?? insertRow,
  });

  revalidatePath("/admin/workflows");
  revalidatePath(`/admin/workflows/${id}`);
  redirect(`/admin/workflows/${id}`);
}

/* ──────────────────── updateWorkflow ──────────────────── */

export async function updateWorkflow(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await readWorkflow(id);
  const payload = readEditPayload(formData);
  if (!payload.display_name) throw new Error("missing display_name");

  const admin = createAdminClient();
  const updates = {
    display_name: payload.display_name,
    description: payload.description,
    status: payload.status,
    trigger_kind: payload.trigger_kind,
    trigger_config: payload.trigger_config,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: after, error: updErr } = await admin
    .from("agent_workflows")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "workflow.update",
    targetType: "agent_workflow",
    targetId: id,
    before: diffBefore(before),
    after: diffBefore(after as AgentWorkflowRow | null) ?? updates,
  });

  revalidatePath("/admin/workflows");
  revalidatePath(`/admin/workflows/${id}`);
}

/* ──────────────────── deleteWorkflow ──────────────────── */

export async function deleteWorkflow(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await readWorkflow(id);
  const admin = createAdminClient();
  const { error: delErr } = await admin
    .from("agent_workflows")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(delErr.message);

  await recordAdminAction({
    action: "workflow.delete",
    targetType: "agent_workflow",
    targetId: id,
    before: diffBefore(before),
  });

  revalidatePath("/admin/workflows");
  redirect("/admin/workflows");
}

/* ──────────────────── setStatus ──────────────────── */

export async function setStatus(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = pickStatus(formData.get("status"));
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("agent_workflows")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`workflow "${id}" not found`);

  const before = (existing as { status: WorkflowStatus }).status;
  if (before === status) return;

  const { error: updErr } = await admin
    .from("agent_workflows")
    .update({
      status,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "workflow.status_change",
    targetType: "agent_workflow",
    targetId: id,
    before: { status: before },
    after: { status },
  });

  revalidatePath("/admin/workflows");
  revalidatePath(`/admin/workflows/${id}`);
}

/* ──────────────────── addStep ──────────────────── */

export async function addStep(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const stepRaw: Record<string, unknown> = {
    kind: formData.get("kind"),
    skill_id: formData.get("skill_id") ?? undefined,
    tool_name: formData.get("tool_name") ?? undefined,
    prompt_id: formData.get("prompt_id") ?? undefined,
    condition: formData.get("condition") ?? undefined,
    output_var: formData.get("output_var") ?? undefined,
  };
  const step = normalizeStep(stepRaw, 0);

  const row = await readWorkflow(id);
  const steps = getStepsArray(row);
  const next = [...steps, step];
  await writeWorkflowSteps(id, next, auth.userId);

  await recordAdminAction({
    action: "workflow.step_add",
    targetType: "agent_workflow",
    targetId: id,
    after: { step, index: next.length - 1 },
    metadata: { workflow_id: id, step_kind: step.kind },
  });

  revalidatePath(`/admin/workflows/${id}`);
}

/* ──────────────────── removeStep ──────────────────── */

export async function removeStep(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const indexRaw = String(formData.get("index") ?? "");
  if (!id) throw new Error("missing id");
  const index = Number.parseInt(indexRaw, 10);
  if (!Number.isFinite(index) || index < 0) {
    throw new Error("invalid step index");
  }

  const row = await readWorkflow(id);
  const steps = getStepsArray(row);
  if (index >= steps.length) {
    throw new Error(`step index ${index} out of range`);
  }
  const removed = steps[index];
  const next = steps.filter((_, i) => i !== index);
  await writeWorkflowSteps(id, next, auth.userId);

  await recordAdminAction({
    action: "workflow.step_remove",
    targetType: "agent_workflow",
    targetId: id,
    before: { step: removed, index },
    metadata: { workflow_id: id, step_kind: removed.kind },
  });

  revalidatePath(`/admin/workflows/${id}`);
}

/* ──────────────────── moveStep ──────────────────── */

export async function moveStep(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const indexRaw = String(formData.get("index") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id) throw new Error("missing id");
  const index = Number.parseInt(indexRaw, 10);
  if (!Number.isFinite(index) || index < 0) {
    throw new Error("invalid step index");
  }
  if (direction !== "up" && direction !== "down") {
    throw new Error("direction must be 'up' or 'down'");
  }

  const row = await readWorkflow(id);
  const steps = getStepsArray(row);
  if (index >= steps.length) {
    throw new Error(`step index ${index} out of range`);
  }

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= steps.length) {
    // No-op — at the boundary. Don't audit-log a non-move.
    return;
  }

  const next = steps.slice();
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  await writeWorkflowSteps(id, next, auth.userId);

  await recordAdminAction({
    action: "workflow.step_move",
    targetType: "agent_workflow",
    targetId: id,
    before: { index },
    after: { index: target },
    metadata: { workflow_id: id, direction },
  });

  revalidatePath(`/admin/workflows/${id}`);
}
