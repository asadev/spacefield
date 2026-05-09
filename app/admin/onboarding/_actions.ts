"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type {
  OnboardingFlowRow,
  OnboardingStepKind,
  OnboardingStepRow,
} from "../_types";

/**
 * Server actions for /admin/onboarding.
 *
 * Flow CRUD:
 *   createFlow, updateFlow, deleteFlow, setStatus
 * Step CRUD:
 *   addStep, updateStep, deleteStep, moveStep
 *
 * Audit verbs: onboarding_flow.{create|update|delete|status_change},
 *              onboarding_step.{add|update|delete|move}.
 *
 * Identifiers: onboarding_flows.id is text (caller-supplied, slug-style).
 *              onboarding_steps.id is uuid (database-generated).
 */

type FlowStatus = OnboardingFlowRow["status"];

const STATUSES: ReadonlySet<FlowStatus> = new Set([
  "live",
  "draft",
  "archived",
]);

const STEP_KINDS: ReadonlySet<OnboardingStepKind> = new Set([
  "welcome",
  "tour",
  "form",
  "video",
  "checklist",
  "call-to-action",
]);

// Slug-style flow id: lowercase alphanum + dot/underscore/hyphen.
const FLOW_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

/* ──────────────────── helpers ──────────────────── */

function pickStatus(raw: unknown): FlowStatus {
  const v = String(raw ?? "draft");
  return STATUSES.has(v as FlowStatus) ? (v as FlowStatus) : "draft";
}

function pickStepKind(raw: unknown): OnboardingStepKind {
  const v = String(raw ?? "welcome");
  return STEP_KINDS.has(v as OnboardingStepKind)
    ? (v as OnboardingStepKind)
    : "welcome";
}

function parseConfig(raw: unknown): Record<string, unknown> {
  const text = String(raw ?? "").trim();
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `config is not valid JSON: ${(e as Error).message}`
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("config must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function nullableTrim(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s ? s : null;
}

type FlowEditPayload = {
  display_name: string;
  description: string;
  trigger_event: string;
  audience: string;
  status: FlowStatus;
};

function readFlowPayload(formData: FormData): FlowEditPayload {
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");
  if (display_name.length > 120) {
    throw new Error("display_name must be ≤ 120 characters");
  }
  const description = String(formData.get("description") ?? "").trim();
  const trigger_event = String(formData.get("trigger_event") ?? "first_login")
    .trim();
  if (!trigger_event) throw new Error("missing trigger_event");
  const audience = String(formData.get("audience") ?? "all").trim() || "all";
  const status = pickStatus(formData.get("status"));
  return { display_name, description, trigger_event, audience, status };
}

function diffFlow(row: OnboardingFlowRow | null) {
  if (!row) return null;
  const { created_at: _c, updated_at: _u, ...rest } = row;
  void _c;
  void _u;
  return rest;
}

function diffStep(row: OnboardingStepRow | null) {
  if (!row) return null;
  const { created_at: _c, ...rest } = row;
  void _c;
  return rest;
}

async function readFlow(id: string): Promise<OnboardingFlowRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding_flows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`onboarding flow "${id}" not found`);
  return data as OnboardingFlowRow;
}

async function readStep(id: string): Promise<OnboardingStepRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding_steps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`onboarding step "${id}" not found`);
  return data as OnboardingStepRow;
}

async function readStepsForFlow(
  flowId: string
): Promise<OnboardingStepRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding_steps")
    .select("*")
    .eq("flow_id", flowId)
    .order("step_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OnboardingStepRow[];
}

/* ──────────────────── createFlow ──────────────────── */

export async function createFlow(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (id.length > 64) throw new Error("id must be ≤ 64 characters");
  if (!FLOW_ID_RE.test(id)) {
    throw new Error(
      "id must be lowercase letters/digits/dot/underscore/hyphen (start alphanum)"
    );
  }

  const payload = readFlowPayload(formData);

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("onboarding_flows")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) throw new Error(`flow id "${id}" already exists`);

  const insertRow = {
    id,
    display_name: payload.display_name,
    description: payload.description,
    trigger_event: payload.trigger_event,
    audience: payload.audience,
    status: payload.status,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await admin
    .from("onboarding_flows")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "onboarding_flow.create",
    targetType: "onboarding_flow",
    targetId: id,
    after: diffFlow(inserted as OnboardingFlowRow | null) ?? insertRow,
  });

  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/onboarding/${id}`);
  redirect(`/admin/onboarding/${id}`);
}

/* ──────────────────── updateFlow ──────────────────── */

export async function updateFlow(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await readFlow(id);
  const payload = readFlowPayload(formData);

  const admin = createAdminClient();
  const updates = {
    display_name: payload.display_name,
    description: payload.description,
    trigger_event: payload.trigger_event,
    audience: payload.audience,
    status: payload.status,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: after, error: updErr } = await admin
    .from("onboarding_flows")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "onboarding_flow.update",
    targetType: "onboarding_flow",
    targetId: id,
    before: diffFlow(before),
    after: diffFlow(after as OnboardingFlowRow | null) ?? updates,
  });

  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/onboarding/${id}`);
}

/* ──────────────────── deleteFlow ──────────────────── */

export async function deleteFlow(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await readFlow(id);
  // onboarding_steps cascades on flow delete (FK on delete cascade) so
  // we don't need to clean them up explicitly.
  const admin = createAdminClient();
  const { error: delErr } = await admin
    .from("onboarding_flows")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(delErr.message);

  await recordAdminAction({
    action: "onboarding_flow.delete",
    targetType: "onboarding_flow",
    targetId: id,
    before: diffFlow(before),
  });

  revalidatePath("/admin/onboarding");
  redirect("/admin/onboarding");
}

/* ──────────────────── setStatus ──────────────────── */

export async function setStatus(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = pickStatus(formData.get("status"));
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("onboarding_flows")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`flow "${id}" not found`);

  const before = (existing as { status: FlowStatus }).status;
  if (before === status) return;

  const { error: updErr } = await admin
    .from("onboarding_flows")
    .update({
      status,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "onboarding_flow.status_change",
    targetType: "onboarding_flow",
    targetId: id,
    before: { status: before },
    after: { status },
  });

  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/onboarding/${id}`);
}

/* ──────────────────── addStep ──────────────────── */

export async function addStep(formData: FormData): Promise<void> {
  await assertAdmin();
  const flowId = String(formData.get("flow_id") ?? "").trim();
  if (!flowId) throw new Error("missing flow_id");
  // Asserts the flow exists so we surface a clean error.
  await readFlow(flowId);

  const kind = pickStepKind(formData.get("kind"));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("missing step title");
  if (title.length > 200) throw new Error("title must be ≤ 200 characters");
  const body = nullableTrim(formData.get("body"));
  const cta_label = nullableTrim(formData.get("cta_label"));
  const cta_href = nullableTrim(formData.get("cta_href"));
  const config = parseConfig(formData.get("config"));

  // Pick the next step_index = max(existing) + 1 (or 0 if no rows).
  const existing = await readStepsForFlow(flowId);
  const nextIndex =
    existing.length === 0
      ? 0
      : Math.max(...existing.map((s) => s.step_index)) + 1;

  const insertRow = {
    flow_id: flowId,
    step_index: nextIndex,
    kind,
    title,
    body,
    cta_label,
    cta_href,
    config,
  };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("onboarding_steps")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "onboarding_step.add",
    targetType: "onboarding_step",
    targetId: (inserted as OnboardingStepRow | null)?.id,
    after: diffStep(inserted as OnboardingStepRow | null) ?? insertRow,
    metadata: { flow_id: flowId, step_index: nextIndex, kind },
  });

  revalidatePath(`/admin/onboarding/${flowId}`);
}

/* ──────────────────── updateStep ──────────────────── */

export async function updateStep(formData: FormData): Promise<void> {
  await assertAdmin();
  const stepId = String(formData.get("step_id") ?? "").trim();
  if (!stepId) throw new Error("missing step_id");

  const before = await readStep(stepId);
  const kind = pickStepKind(formData.get("kind"));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("missing step title");
  if (title.length > 200) throw new Error("title must be ≤ 200 characters");
  const body = nullableTrim(formData.get("body"));
  const cta_label = nullableTrim(formData.get("cta_label"));
  const cta_href = nullableTrim(formData.get("cta_href"));
  const config = parseConfig(formData.get("config"));

  const updates = { kind, title, body, cta_label, cta_href, config };

  const admin = createAdminClient();
  const { data: after, error } = await admin
    .from("onboarding_steps")
    .update(updates)
    .eq("id", stepId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "onboarding_step.update",
    targetType: "onboarding_step",
    targetId: stepId,
    before: diffStep(before),
    after: diffStep(after as OnboardingStepRow | null) ?? updates,
    metadata: { flow_id: before.flow_id },
  });

  revalidatePath(`/admin/onboarding/${before.flow_id}`);
}

/* ──────────────────── deleteStep ──────────────────── */

export async function deleteStep(formData: FormData): Promise<void> {
  await assertAdmin();
  const stepId = String(formData.get("step_id") ?? "").trim();
  if (!stepId) throw new Error("missing step_id");

  const before = await readStep(stepId);

  const admin = createAdminClient();
  const { error } = await admin
    .from("onboarding_steps")
    .delete()
    .eq("id", stepId);
  if (error) throw new Error(error.message);

  // Re-pack step indexes so the remaining steps stay 0..N-1 contiguous.
  const remaining = await readStepsForFlow(before.flow_id);
  const updates = remaining
    .map((s, idx) => ({ id: s.id, target: idx }))
    .filter((u) => {
      const original = remaining.find((s) => s.id === u.id);
      return original ? original.step_index !== u.target : false;
    });
  if (updates.length > 0) {
    for (const u of updates) {
      const { error: rerr } = await admin
        .from("onboarding_steps")
        .update({ step_index: u.target })
        .eq("id", u.id);
      if (rerr) throw new Error(rerr.message);
    }
  }

  await recordAdminAction({
    action: "onboarding_step.delete",
    targetType: "onboarding_step",
    targetId: stepId,
    before: diffStep(before),
    metadata: { flow_id: before.flow_id, step_index: before.step_index },
  });

  revalidatePath(`/admin/onboarding/${before.flow_id}`);
}

/* ──────────────────── moveStep ──────────────────── */

export async function moveStep(formData: FormData): Promise<void> {
  await assertAdmin();
  const stepId = String(formData.get("step_id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "");
  if (!stepId) throw new Error("missing step_id");
  if (direction !== "up" && direction !== "down") {
    throw new Error("direction must be 'up' or 'down'");
  }

  const target = await readStep(stepId);
  const flowId = target.flow_id;
  const all = await readStepsForFlow(flowId);
  const idx = all.findIndex((s) => s.id === stepId);
  if (idx < 0) throw new Error("step not found in flow");

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) {
    // Boundary — no-op, no audit row.
    return;
  }
  const swapStep = all[swapIdx];
  const oldA = target.step_index;
  const oldB = swapStep.step_index;

  const admin = createAdminClient();
  // Two-phase swap to satisfy a unique (flow_id, step_index) constraint
  // if/when one is added. Even without the constraint this avoids any
  // intermediate-state ambiguity.
  const { error: e1 } = await admin
    .from("onboarding_steps")
    .update({ step_index: -1 })
    .eq("id", target.id);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await admin
    .from("onboarding_steps")
    .update({ step_index: oldA })
    .eq("id", swapStep.id);
  if (e2) throw new Error(e2.message);
  const { error: e3 } = await admin
    .from("onboarding_steps")
    .update({ step_index: oldB })
    .eq("id", target.id);
  if (e3) throw new Error(e3.message);

  await recordAdminAction({
    action: "onboarding_step.move",
    targetType: "onboarding_step",
    targetId: stepId,
    before: { step_index: oldA },
    after: { step_index: oldB },
    metadata: { flow_id: flowId, direction },
  });

  revalidatePath(`/admin/onboarding/${flowId}`);
}
