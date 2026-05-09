"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateRuntimeModelCache } from "@/lib/agent/runtime/_models";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import {
  CALL_KINDS,
  MODEL_PROVIDERS,
  type AiModelRow,
  type CallKind,
  type CapabilityTier,
  type ModelProvider,
  type ModelStatus,
  type RuntimeModelAssignmentRow,
} from "../_types";

/**
 * Server actions for the AI Models admin UI.
 *
 * Audit verbs (per the contract):
 *   model.create, model.update, model.delete, model.runtime_assign.
 *
 * Each mutation:
 *   1. assertAdmin().
 *   2. Validates inputs via the parsers below.
 *   3. Writes to public.ai_models / public.runtime_model_assignments via
 *      the service-role client.
 *   4. Records an audit row via recordAdminAction(...).
 *   5. invalidateRuntimeModelCache() on assignment changes so the next
 *      runtime call on this server picks up the new model id immediately.
 */

const PROVIDER_SET: ReadonlySet<ModelProvider> = new Set(MODEL_PROVIDERS);
const STATUS_SET: ReadonlySet<ModelStatus> = new Set([
  "live",
  "beta",
  "deprecated",
]);
const TIER_SET: ReadonlySet<CapabilityTier> = new Set([
  "flagship",
  "balanced",
  "fast",
  "reasoning",
]);
const CALL_KIND_SET: ReadonlySet<CallKind> = new Set(CALL_KINDS);

/** Model id format: lowercase alphanumeric + dot + hyphen. Mirrors the
 * shape Anthropic / OpenAI use ("claude-haiku-4-5", "gpt-4o-mini"). */
const MODEL_ID_RE = /^[a-z0-9][a-z0-9.\-]{0,127}[a-z0-9]$|^[a-z0-9]$/;

/* ──────────────────── helpers ──────────────────── */

function pickProvider(raw: unknown): ModelProvider {
  const v = String(raw ?? "anthropic");
  return PROVIDER_SET.has(v as ModelProvider)
    ? (v as ModelProvider)
    : "anthropic";
}

function pickStatus(raw: unknown): ModelStatus {
  const v = String(raw ?? "live");
  return STATUS_SET.has(v as ModelStatus) ? (v as ModelStatus) : "live";
}

function pickTier(raw: unknown): CapabilityTier {
  const v = String(raw ?? "balanced");
  return TIER_SET.has(v as CapabilityTier)
    ? (v as CapabilityTier)
    : "balanced";
}

function pickCallKind(raw: unknown): CallKind | null {
  const v = String(raw ?? "");
  return CALL_KIND_SET.has(v as CallKind) ? (v as CallKind) : null;
}

function pickInt(raw: unknown, fallback: number, min: number, max: number) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickNumber(raw: unknown, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickBool(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const v = String(raw ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Build the full update/insert payload from a form post. */
function readFormPayload(formData: FormData) {
  const provider = pickProvider(formData.get("provider"));
  const label = String(formData.get("label") ?? "").trim();
  const context_window = pickInt(
    formData.get("context_window"),
    200000,
    1024,
    10_000_000
  );
  const max_output_tokens = pickInt(
    formData.get("max_output_tokens"),
    4096,
    1,
    1_000_000
  );
  const supports_vision = pickBool(formData.get("supports_vision"));
  const supports_thinking = pickBool(formData.get("supports_thinking"));
  const supports_tools = pickBool(formData.get("supports_tools"));
  const cost_input_per_million = pickNumber(
    formData.get("cost_input_per_million"),
    0,
    0,
    100000
  );
  const cost_output_per_million = pickNumber(
    formData.get("cost_output_per_million"),
    0,
    0,
    100000
  );
  const status = pickStatus(formData.get("status"));
  const capability_tier = pickTier(formData.get("capability_tier"));
  const sort_order = pickInt(formData.get("sort_order"), 0, -10000, 10000);

  return {
    provider,
    label,
    context_window,
    max_output_tokens,
    supports_vision,
    supports_thinking,
    supports_tools,
    cost_input_per_million,
    cost_output_per_million,
    status,
    capability_tier,
    sort_order,
  };
}

function diffBefore(row: AiModelRow | null) {
  if (!row) return null;
  const { created_at: _c, updated_at: _u, updated_by: _b, ...rest } = row;
  void _c;
  void _u;
  void _b;
  return rest;
}

/* ──────────────────── createModel ──────────────────── */

export async function createModel(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (!MODEL_ID_RE.test(id)) {
    throw new Error(
      "id must be lowercase letters/digits/dots/hyphens (1–128 chars, no leading/trailing punctuation)"
    );
  }

  const payload = readFormPayload(formData);
  if (!payload.label) throw new Error("missing label");

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_models")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) throw new Error(`model id "${id}" already exists`);

  const insertRow = {
    id,
    ...payload,
    metadata: {},
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await admin
    .from("ai_models")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "model.create",
    targetType: "ai_model",
    targetId: id,
    after: diffBefore(inserted as AiModelRow | null) ?? insertRow,
  });

  revalidatePath("/admin/models");
  revalidatePath(`/admin/models/${id}`);
  redirect(`/admin/models/${id}`);
}

/* ──────────────────── updateModel ──────────────────── */

export async function updateModel(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const payload = readFormPayload(formData);
  if (!payload.label) throw new Error("missing label");

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_models")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`model "${id}" not found`);

  const updates = {
    ...payload,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: after, error: updErr } = await admin
    .from("ai_models")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "model.update",
    targetType: "ai_model",
    targetId: id,
    before: diffBefore(existing as AiModelRow),
    after: diffBefore(after as AiModelRow | null) ?? updates,
  });

  // Provider can change on a model — invalidate so executor/etc. pick up
  // the new provider when looked up via the join.
  invalidateRuntimeModelCache();

  revalidatePath("/admin/models");
  revalidatePath(`/admin/models/${id}`);
}

/* ──────────────────── deleteModel ──────────────────── */

export async function deleteModel(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_models")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`model "${id}" not found`);

  // Block delete if any agent or runtime assignment references this id.
  const [{ count: agentRefs, error: aErr }, { count: rmaRefs, error: rmaErr }, { count: rmaFb, error: fbErr }] = await Promise.all([
    admin
      .from("ai_agents")
      .select("id", { count: "exact", head: true })
      .or(`model.eq.${id},fast_model.eq.${id}`),
    admin
      .from("runtime_model_assignments")
      .select("call_kind", { count: "exact", head: true })
      .eq("model_id", id),
    admin
      .from("runtime_model_assignments")
      .select("call_kind", { count: "exact", head: true })
      .eq("fallback_model_id", id),
  ]);
  if (aErr) throw new Error(aErr.message);
  if (rmaErr) throw new Error(rmaErr.message);
  if (fbErr) throw new Error(fbErr.message);

  if ((agentRefs ?? 0) > 0) {
    throw new Error(
      `model is referenced by ${agentRefs} agent(s); reassign them before deleting`
    );
  }
  if ((rmaRefs ?? 0) > 0) {
    throw new Error(
      `model is the active assignment for ${rmaRefs} call_kind(s); reassign them before deleting`
    );
  }
  if ((rmaFb ?? 0) > 0) {
    throw new Error(
      `model is the fallback for ${rmaFb} call_kind assignment(s); clear them before deleting`
    );
  }

  const { error: delErr } = await admin
    .from("ai_models")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(delErr.message);

  await recordAdminAction({
    action: "model.delete",
    targetType: "ai_model",
    targetId: id,
    before: diffBefore(existing as AiModelRow),
  });

  invalidateRuntimeModelCache();

  revalidatePath("/admin/models");
  redirect("/admin/models");
}

/* ──────────────────── setRuntimeAssignment ──────────────────── */

export async function setRuntimeAssignment(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const callKind = pickCallKind(formData.get("call_kind"));
  if (!callKind) throw new Error("invalid call_kind");

  const model_id = String(formData.get("model_id") ?? "").trim();
  if (!model_id) throw new Error("missing model_id");

  const fallbackRaw = String(formData.get("fallback_model_id") ?? "").trim();
  const fallback_model_id = fallbackRaw === "" ? null : fallbackRaw;
  const temperature = pickNumber(formData.get("temperature"), 1.0, 0, 2);
  const max_tokens = pickInt(formData.get("max_tokens"), 4096, 1, 200000);

  const admin = createAdminClient();

  // Validate that the model_id (and fallback if set) actually exist.
  const { data: live, error: liveErr } = await admin
    .from("ai_models")
    .select("id")
    .in(
      "id",
      fallback_model_id ? [model_id, fallback_model_id] : [model_id]
    );
  if (liveErr) throw new Error(liveErr.message);
  const known = new Set((live ?? []).map((r) => (r as { id: string }).id));
  if (!known.has(model_id)) {
    throw new Error(`model "${model_id}" not in ai_models`);
  }
  if (fallback_model_id && !known.has(fallback_model_id)) {
    throw new Error(
      `fallback model "${fallback_model_id}" not in ai_models`
    );
  }

  // Read prior for the audit diff.
  const { data: before } = await admin
    .from("runtime_model_assignments")
    .select("*")
    .eq("call_kind", callKind)
    .maybeSingle();

  const upsertRow = {
    call_kind: callKind,
    model_id,
    fallback_model_id,
    temperature,
    max_tokens,
    metadata: {},
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: after, error: upsertErr } = await admin
    .from("runtime_model_assignments")
    .upsert(upsertRow, { onConflict: "call_kind" })
    .select()
    .maybeSingle();
  if (upsertErr) throw new Error(upsertErr.message);

  await recordAdminAction({
    action: "model.runtime_assign",
    targetType: "runtime_model_assignment",
    targetId: callKind,
    before: (before as RuntimeModelAssignmentRow | null) ?? null,
    after: (after as RuntimeModelAssignmentRow | null) ?? upsertRow,
  });

  invalidateRuntimeModelCache();

  revalidatePath("/admin/models/runtime");
  revalidatePath("/admin/models");
}
