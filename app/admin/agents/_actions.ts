"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import {
  AGENT_MODELS,
  TIER_IDS,
  WORKSPACE_ROLES,
  type AgentAccessMode,
  type AgentKind,
  type AgentStatus,
  type AiAgentRow,
} from "../_types";

/**
 * Server actions for the AI Agents admin UI. Each mutation:
 *
 *   1. assertAdmin() — throws if the caller is not admin (Next.js will
 *      surface as a 500 to non-admins; RLS on `ai_agents` is also
 *      admin-only at the DB layer).
 *   2. validates inputs via the small parsers below.
 *   3. writes to public.ai_agents with the service-role client.
 *   4. records an audit row via recordAdminAction(...).
 *
 * Audit action conventions (from the contract):
 *   agent.create, agent.update, agent.delete, agent.status_change.
 */

const MODEL_IDS = new Set(AGENT_MODELS.map((m) => m.id) as string[]);
const KINDS: ReadonlySet<AgentKind> = new Set([
  "chat",
  "tool-sidekick",
  "system",
]);
const STATUSES: ReadonlySet<AgentStatus> = new Set([
  "live",
  "draft",
  "disabled",
]);
const ACCESS_MODES: ReadonlySet<AgentAccessMode> = new Set([
  "all",
  "tier",
  "workspace_role",
  "allowlist",
  "admin_only",
]);
const TIER_SET = new Set(TIER_IDS as readonly string[]);
const ROLE_SET = new Set(WORKSPACE_ROLES as readonly string[]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

/* ──────────────────── helpers ──────────────────── */

function pickKind(raw: unknown): AgentKind {
  const v = String(raw ?? "tool-sidekick");
  return KINDS.has(v as AgentKind) ? (v as AgentKind) : "tool-sidekick";
}

function pickStatus(raw: unknown): AgentStatus {
  const v = String(raw ?? "draft");
  return STATUSES.has(v as AgentStatus) ? (v as AgentStatus) : "draft";
}

function pickAccessMode(raw: unknown): AgentAccessMode {
  const v = String(raw ?? "all");
  return ACCESS_MODES.has(v as AgentAccessMode)
    ? (v as AgentAccessMode)
    : "all";
}

function pickModel(raw: unknown, fallback: string): string {
  const v = String(raw ?? "").trim();
  if (v && MODEL_IDS.has(v)) return v;
  return fallback;
}

function pickNumber(raw: unknown, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickInt(raw: unknown, fallback: number, min: number, max: number) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function uniqStrings(values: readonly (string | undefined | null)[]): string[] {
  return Array.from(
    new Set(
      values
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v) => v.length > 0)
    )
  );
}

function parseUuidsTextarea(raw: unknown): string[] {
  const s = String(raw ?? "");
  return uniqStrings(s.split(/[\s,]+/));
}

/** Build the full update/insert payload from a form post. */
function readFormPayload(formData: FormData) {
  const display_name = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const kind = pickKind(formData.get("kind"));
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const sort_order = pickInt(formData.get("sort_order"), 0, -10000, 10000);

  const model = pickModel(formData.get("model"), "claude-opus-4-7");
  const fast_model = pickModel(
    formData.get("fast_model"),
    "claude-haiku-4-5-20251001"
  );
  const system_prompt = String(formData.get("system_prompt") ?? "");
  const greeting = String(formData.get("greeting") ?? "");
  const temperature = pickNumber(formData.get("temperature"), 1.0, 0, 2);
  const max_tokens = pickInt(formData.get("max_tokens"), 4096, 1, 200000);

  const status = pickStatus(formData.get("status"));
  const access_mode = pickAccessMode(formData.get("access_mode"));

  const access_tiers = formData
    .getAll("access_tiers")
    .map((v) => String(v).trim())
    .filter((v) => TIER_SET.has(v));
  const access_roles = formData
    .getAll("access_roles")
    .map((v) => String(v).trim())
    .filter((v) => ROLE_SET.has(v));
  const allowlist_user_ids = parseUuidsTextarea(
    formData.get("allowlist_user_ids")
  );

  const allowed_skills = uniqStrings(
    formData.getAll("allowed_skills").map((v) => String(v))
  );
  const allowed_tools = uniqStrings(
    formData.getAll("allowed_tools").map((v) => String(v))
  );

  return {
    display_name,
    description,
    kind,
    icon,
    sort_order,
    model,
    fast_model,
    system_prompt,
    greeting,
    temperature,
    max_tokens,
    status,
    access_mode,
    access_tiers,
    access_roles,
    allowlist_user_ids,
    allowed_skills,
    allowed_tools,
  };
}

/**
 * Strip volatile fields so audit diffs only show meaningful changes.
 */
function diffBefore(row: AiAgentRow | null) {
  if (!row) return null;
  const { created_at: _c, updated_at: _u, updated_by: _b, ...rest } = row;
  void _c;
  void _u;
  void _b;
  return rest;
}

/* ──────────────────── createAgent ──────────────────── */

export async function createAgent(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (!SLUG_RE.test(id)) {
    throw new Error(
      "id must be lowercase letters/digits/hyphens (1–64 chars, no leading/trailing hyphen)"
    );
  }

  const payload = readFormPayload(formData);
  if (!payload.display_name) throw new Error("missing display_name");

  const admin = createAdminClient();

  // Reject duplicate id up-front so the user gets a clean error rather
  // than the raw Postgres unique-violation message.
  const { data: existing, error: readErr } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) throw new Error(`agent id "${id}" already exists`);

  const insertRow = {
    id,
    display_name: payload.display_name,
    description: payload.description,
    kind: payload.kind,
    icon: payload.icon,
    sort_order: payload.sort_order,
    model: payload.model,
    fast_model: payload.fast_model,
    system_prompt: payload.system_prompt,
    greeting: payload.greeting,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    status: payload.status,
    access_mode: payload.access_mode,
    access_tiers: payload.access_tiers,
    access_roles: payload.access_roles,
    allowlist_user_ids: payload.allowlist_user_ids,
    allowed_skills: payload.allowed_skills,
    allowed_tools: payload.allowed_tools,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await admin
    .from("ai_agents")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "agent.create",
    targetType: "ai_agent",
    targetId: id,
    after: diffBefore(inserted as AiAgentRow | null) ?? insertRow,
  });

  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${id}`);
  redirect(`/admin/agents/${id}`);
}

/* ──────────────────── updateAgent ──────────────────── */

export async function updateAgent(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const payload = readFormPayload(formData);
  if (!payload.display_name) throw new Error("missing display_name");

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_agents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`agent "${id}" not found`);

  const updates = {
    display_name: payload.display_name,
    description: payload.description,
    kind: payload.kind,
    icon: payload.icon,
    sort_order: payload.sort_order,
    model: payload.model,
    fast_model: payload.fast_model,
    system_prompt: payload.system_prompt,
    greeting: payload.greeting,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    status: payload.status,
    access_mode: payload.access_mode,
    access_tiers: payload.access_tiers,
    access_roles: payload.access_roles,
    allowlist_user_ids: payload.allowlist_user_ids,
    allowed_skills: payload.allowed_skills,
    allowed_tools: payload.allowed_tools,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: after, error: updErr } = await admin
    .from("ai_agents")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "agent.update",
    targetType: "ai_agent",
    targetId: id,
    before: diffBefore(existing as AiAgentRow),
    after: diffBefore(after as AiAgentRow | null) ?? updates,
  });

  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${id}`);
}

/* ──────────────────── deleteAgent ──────────────────── */

export async function deleteAgent(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_agents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`agent "${id}" not found`);

  // Guard: only allow deletes when the agent is disabled AND has no
  // recent runs. Hard delete of an active agent could break running
  // sessions and orphan ai_agent_runs rows.
  if ((existing as AiAgentRow).status !== "disabled") {
    throw new Error("agent must be disabled before deletion");
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error: cntErr } = await admin
    .from("ai_agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", id)
    .gte("created_at", since);
  if (cntErr) throw new Error(cntErr.message);
  if ((count ?? 0) > 0) {
    throw new Error(
      `agent has ${count} runs in the last 30 days; cannot delete`
    );
  }

  const { error: delErr } = await admin
    .from("ai_agents")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(delErr.message);

  await recordAdminAction({
    action: "agent.delete",
    targetType: "ai_agent",
    targetId: id,
    before: diffBefore(existing as AiAgentRow),
  });

  revalidatePath("/admin/agents");
  redirect("/admin/agents");
}

/* ──────────────────── setAgentToolOverride ──────────────────── */

/**
 * Upsert a single row in `agent_tool_overrides`. The form contributes:
 *   agent_id, skill_id, tool_name (composite primary key)
 *   override_description (string; empty means "clear override")
 *   read_only_override (string "true"|"false"|"" — "" clears override)
 *   requires_confirmation_override (same shape as read_only_override)
 *   enabled (checkbox, defaults true)
 *
 * For each "override" field the form sends an explicit "" to mean
 * "no override" (cleared) — null in the DB. This keeps the editor
 * stateless: the form is the source of truth on every save.
 */
function pickTriBool(raw: unknown): boolean | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

const SKILL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TOOL_NAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/;

export async function setAgentToolOverride(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const skillId = String(formData.get("skill_id") ?? "").trim();
  const toolName = String(formData.get("tool_name") ?? "").trim();

  if (!agentId) throw new Error("missing agent_id");
  if (!skillId || !SKILL_ID_RE.test(skillId)) {
    throw new Error("invalid skill_id");
  }
  if (!toolName || !TOOL_NAME_RE.test(toolName)) {
    throw new Error("invalid tool_name");
  }

  const description = String(formData.get("override_description") ?? "").trim();
  const readOnly = pickTriBool(formData.get("read_only_override"));
  const requiresConf = pickTriBool(
    formData.get("requires_confirmation_override")
  );
  // checkbox is "on" when checked; absent when unchecked. Default true.
  const rawEnabled = formData.get("enabled");
  const enabled = rawEnabled === null ? true : String(rawEnabled) === "on" || String(rawEnabled) === "true";

  const admin = createAdminClient();

  // Verify the agent exists — fail fast with a clear message instead of
  // a foreign-key violation from the DB.
  const { data: agentRow, error: agentErr } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();
  if (agentErr) throw new Error(agentErr.message);
  if (!agentRow) throw new Error(`agent "${agentId}" not found`);

  const { data: existing, error: readErr } = await admin
    .from("agent_tool_overrides")
    .select("*")
    .eq("agent_id", agentId)
    .eq("skill_id", skillId)
    .eq("tool_name", toolName)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  const row = {
    agent_id: agentId,
    skill_id: skillId,
    tool_name: toolName,
    override_description: description.length > 0 ? description : null,
    read_only_override: readOnly,
    requires_confirmation_override: requiresConf,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await admin
    .from("agent_tool_overrides")
    .upsert(row, { onConflict: "agent_id,skill_id,tool_name" });
  if (upErr) throw new Error(upErr.message);

  await recordAdminAction({
    action: "agent.tool_override_set",
    targetType: "ai_agent",
    targetId: agentId,
    before: existing ?? null,
    after: row,
    metadata: { skill_id: skillId, tool_name: toolName },
  });

  revalidatePath(`/admin/agents/${agentId}`);
}

/* ──────────────────── clearAgentToolOverride ──────────────────── */

export async function clearAgentToolOverride(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const skillId = String(formData.get("skill_id") ?? "").trim();
  const toolName = String(formData.get("tool_name") ?? "").trim();

  if (!agentId) throw new Error("missing agent_id");
  if (!skillId) throw new Error("missing skill_id");
  if (!toolName) throw new Error("missing tool_name");

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("agent_tool_overrides")
    .select("*")
    .eq("agent_id", agentId)
    .eq("skill_id", skillId)
    .eq("tool_name", toolName)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  const { error: delErr } = await admin
    .from("agent_tool_overrides")
    .delete()
    .eq("agent_id", agentId)
    .eq("skill_id", skillId)
    .eq("tool_name", toolName);
  if (delErr) throw new Error(delErr.message);

  await recordAdminAction({
    action: "agent.tool_override_clear",
    targetType: "ai_agent",
    targetId: agentId,
    before: existing ?? null,
    metadata: { skill_id: skillId, tool_name: toolName },
  });

  revalidatePath(`/admin/agents/${agentId}`);
}

/* ──────────────────── setAgentStatus ──────────────────── */

export async function setAgentStatus(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = pickStatus(formData.get("status"));
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("ai_agents")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`agent "${id}" not found`);

  const before = (existing as { status: AgentStatus }).status;
  if (before === status) {
    // Nothing to do — skip the audit row to avoid noise.
    return;
  }

  const { error: updErr } = await admin
    .from("ai_agents")
    .update({
      status,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "agent.status_change",
    targetType: "ai_agent",
    targetId: id,
    before: { status: before },
    after: { status },
  });

  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${id}`);
}
