"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { readCodeSkillTools } from "@/lib/agent/skills/_inspector";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import {
  WORKSPACE_ROLES,
  type AgentToolOverrideRow,
  type AiSkillRow,
  type SkillKind,
  type SkillStatus,
  type SkillToolDef,
  type WorkspaceRole,
} from "../_types";

/**
 * Server actions for the Skills admin UI. Mirrors agents/_actions.ts in
 * shape: every mutation calls assertAdmin(), validates inputs, writes to
 * `public.ai_skills` via the service-role client, and records an audit
 * row.
 *
 * Audit conventions (from the contract):
 *   skill.create, skill.update, skill.delete, skill.status_change,
 *   skill.tool_add, skill.tool_update, skill.tool_remove.
 */

const STATUSES: ReadonlySet<SkillStatus> = new Set([
  "live",
  "draft",
  "disabled",
]);
const KINDS: ReadonlySet<SkillKind> = new Set(["code", "custom"]);
const ROLE_SET = new Set(WORKSPACE_ROLES as readonly string[]);

// Skill ID format: lowercase alphanum + dot + underscore + hyphen.
const SKILL_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;

/* ──────────────────── helpers ──────────────────── */

function pickStatus(raw: unknown): SkillStatus {
  const v = String(raw ?? "draft");
  return STATUSES.has(v as SkillStatus) ? (v as SkillStatus) : "draft";
}

function pickKind(raw: unknown): SkillKind {
  const v = String(raw ?? "custom");
  return KINDS.has(v as SkillKind) ? (v as SkillKind) : "custom";
}

function pickInt(raw: unknown, fallback: number, min: number, max: number) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickRoles(raw: FormDataEntryValue[]): WorkspaceRole[] {
  const filtered = raw
    .map((v) => String(v).trim())
    .filter((v) => ROLE_SET.has(v));
  return Array.from(new Set(filtered)) as WorkspaceRole[];
}

/** Strip tool def to the canonical shape the runtime expects, dropping
 * unknown keys and validating required fields. Throws on bad input.
 */
function normalizeTool(raw: unknown, idx: number): SkillToolDef {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`tools[${idx}]: not an object`);
  }
  const t = raw as Record<string, unknown>;

  const name = String(t.name ?? "").trim();
  if (!TOOL_NAME_RE.test(name)) {
    throw new Error(
      `tools[${idx}].name "${name}" must be snake_case (lowercase letters/digits/underscore, start with a letter)`
    );
  }

  const description = String(t.description ?? "").trim();

  const handlerKindRaw = String(t.handler_kind ?? "rpc");
  const handler_kind: "rpc" | "http" =
    handlerKindRaw === "http" ? "http" : "rpc";

  const handler_target = String(t.handler_target ?? "").trim();
  if (!handler_target) {
    throw new Error(`tools[${idx}].handler_target is required`);
  }
  if (handler_kind === "http" && !/^https?:\/\//i.test(handler_target)) {
    throw new Error(
      `tools[${idx}].handler_target must be an http(s) URL when handler_kind="http"`
    );
  }

  const schemaRaw = t.input_schema;
  if (
    !schemaRaw ||
    typeof schemaRaw !== "object" ||
    Array.isArray(schemaRaw)
  ) {
    throw new Error(`tools[${idx}].input_schema must be a JSON object`);
  }

  const read_only = Boolean(t.read_only);
  const requires_confirmation =
    t.requires_confirmation === true ? true : undefined;

  const handler_params =
    t.handler_params && typeof t.handler_params === "object" && !Array.isArray(t.handler_params)
      ? (t.handler_params as Record<string, unknown>)
      : undefined;

  const out: SkillToolDef = {
    name,
    description,
    input_schema: schemaRaw as Record<string, unknown>,
    read_only,
    handler_kind,
    handler_target,
  };
  if (requires_confirmation) out.requires_confirmation = true;
  if (handler_params) out.handler_params = handler_params;
  return out;
}

function parseToolsJson(raw: unknown): SkillToolDef[] {
  const text = String(raw ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`tools_json is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("tools_json must be an array");
  }
  const tools = parsed.map((t, i) => normalizeTool(t, i));
  // Guard against duplicate names.
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) {
      throw new Error(`duplicate tool name "${t.name}"`);
    }
    seen.add(t.name);
  }
  return tools;
}

type SkillEditPayload = {
  display_name: string;
  description: string;
  system_fragment: string;
  category: string;
  status: SkillStatus;
  icon: string | null;
  sort_order: number;
  allowed_workspace_roles: WorkspaceRole[];
  requires_confirmation_default: boolean;
  tools_json: SkillToolDef[];
};

/** Parse the editor form. Tools_json normalization can throw. */
function readEditPayload(formData: FormData): SkillEditPayload {
  const display_name = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const system_fragment = String(formData.get("system_fragment") ?? "");
  const category = String(formData.get("category") ?? "general").trim() || "general";
  const status = pickStatus(formData.get("status"));
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const sort_order = pickInt(formData.get("sort_order"), 0, -10000, 10000);
  const allowed_workspace_roles = pickRoles(
    formData.getAll("allowed_workspace_roles")
  );
  const requires_confirmation_default =
    formData.get("requires_confirmation_default") != null;
  const tools_json = parseToolsJson(formData.get("tools_json"));

  return {
    display_name,
    description,
    system_fragment,
    category,
    status,
    icon,
    sort_order,
    allowed_workspace_roles,
    requires_confirmation_default,
    tools_json,
  };
}

/** Strip volatile fields so audit diffs only show meaningful changes. */
function diffBefore(row: AiSkillRow | null) {
  if (!row) return null;
  const { created_at: _c, updated_at: _u, updated_by: _b, ...rest } = row;
  void _c;
  void _u;
  void _b;
  return rest;
}

/* ──────────────────── createCustomSkill ──────────────────── */

export async function createCustomSkill(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (id.length > 64) throw new Error("id must be ≤ 64 characters");
  if (!SKILL_ID_RE.test(id)) {
    throw new Error(
      "id must be lowercase letters/digits/dot/underscore/hyphen (start alphanum)"
    );
  }

  // Always create as kind='custom' from the admin panel — code skills
  // are wired in via the runtime imports.
  const kind = pickKind(formData.get("kind"));
  if (kind === "code") {
    throw new Error("cannot create code skills from the admin panel");
  }

  const payload = readEditPayload(formData);
  if (!payload.display_name) throw new Error("missing display_name");

  const admin = createAdminClient();

  // Reject duplicate id up-front for a clean error.
  const { data: existing, error: readErr } = await admin
    .from("ai_skills")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) throw new Error(`skill id "${id}" already exists`);

  const insertRow = {
    id,
    kind: "custom" as const,
    display_name: payload.display_name,
    description: payload.description,
    system_fragment: payload.system_fragment,
    status: payload.status,
    handler_module: null,
    tools_json: payload.tools_json,
    allowed_workspace_roles: payload.allowed_workspace_roles,
    requires_confirmation_default: payload.requires_confirmation_default,
    category: payload.category,
    icon: payload.icon,
    sort_order: payload.sort_order,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await admin
    .from("ai_skills")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "skill.create",
    targetType: "ai_skill",
    targetId: id,
    after: diffBefore(inserted as AiSkillRow | null) ?? insertRow,
  });

  revalidatePath("/admin/skills");
  revalidatePath(`/admin/skills/${id}`);
  redirect(`/admin/skills/${id}`);
}

/* ──────────────────── updateSkill ──────────────────── */

export async function updateSkill(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_skills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`skill "${id}" not found`);

  const before = existing as AiSkillRow;
  const payload = readEditPayload(formData);
  if (!payload.display_name) throw new Error("missing display_name");

  // For code-defined skills the tools_json column is locked — runtime
  // reads tools from the source module. Preserve whatever's in the DB
  // (typically `[]`) to avoid noise in the audit log.
  const finalTools =
    before.kind === "code" ? before.tools_json : payload.tools_json;

  const updates = {
    display_name: payload.display_name,
    description: payload.description,
    system_fragment: payload.system_fragment,
    status: payload.status,
    tools_json: finalTools,
    allowed_workspace_roles: payload.allowed_workspace_roles,
    requires_confirmation_default: payload.requires_confirmation_default,
    category: payload.category,
    icon: payload.icon,
    sort_order: payload.sort_order,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: after, error: updErr } = await admin
    .from("ai_skills")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "skill.update",
    targetType: "ai_skill",
    targetId: id,
    before: diffBefore(before),
    after: diffBefore(after as AiSkillRow | null) ?? updates,
  });

  revalidatePath("/admin/skills");
  revalidatePath(`/admin/skills/${id}`);
}

/* ──────────────────── deleteSkill ──────────────────── */

export async function deleteSkill(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_skills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`skill "${id}" not found`);

  const row = existing as AiSkillRow;

  // Code skills cannot be deleted from the admin panel — they're owned
  // by source. Move to disabled instead if you need to take one offline.
  if (row.kind === "code") {
    throw new Error(
      "code skills cannot be deleted from the admin panel — set status to disabled instead"
    );
  }

  const { error: delErr } = await admin
    .from("ai_skills")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(delErr.message);

  await recordAdminAction({
    action: "skill.delete",
    targetType: "ai_skill",
    targetId: id,
    before: diffBefore(row),
  });

  revalidatePath("/admin/skills");
  redirect("/admin/skills");
}

/* ──────────────────── setSkillStatus ──────────────────── */

export async function setSkillStatus(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = pickStatus(formData.get("status"));
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("ai_skills")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`skill "${id}" not found`);

  const before = (existing as { status: SkillStatus }).status;
  if (before === status) return; // no-op, skip audit noise

  const { error: updErr } = await admin
    .from("ai_skills")
    .update({
      status,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "skill.status_change",
    targetType: "ai_skill",
    targetId: id,
    before: { status: before },
    after: { status },
  });

  revalidatePath("/admin/skills");
  revalidatePath(`/admin/skills/${id}`);
}

/* ──────────────────── tool-level mutations ────────────────────
 * These are useful when only one tool changes — keeps the audit row
 * tight (single tool diff) and avoids re-validating the entire list.
 * The bulk path is updateSkill which writes the whole tools_json. */

async function readSkillForToolEdit(id: string): Promise<AiSkillRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_skills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`skill "${id}" not found`);
  const row = data as AiSkillRow;
  if (row.kind !== "custom") {
    throw new Error("only custom skills support per-tool edits");
  }
  return row;
}

async function writeSkillTools(
  id: string,
  tools: SkillToolDef[],
  actorId: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("ai_skills")
    .update({
      tools_json: tools,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addSkillTool(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const toolJson = String(formData.get("tool") ?? "");
  if (!toolJson) throw new Error("missing tool payload");

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolJson);
  } catch (e) {
    throw new Error(`tool is not valid JSON: ${(e as Error).message}`);
  }
  const tool = normalizeTool(parsed, 0);

  const row = await readSkillForToolEdit(id);
  if (row.tools_json.some((t) => t.name === tool.name)) {
    throw new Error(`tool "${tool.name}" already exists`);
  }
  const next = [...row.tools_json, tool];
  await writeSkillTools(id, next, auth.userId);

  await recordAdminAction({
    action: "skill.tool_add",
    targetType: "ai_skill",
    targetId: id,
    after: { tool },
    metadata: { skill_id: id, tool_name: tool.name },
  });

  revalidatePath(`/admin/skills/${id}`);
}

export async function updateSkillTool(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const originalName = String(formData.get("original_name") ?? "").trim();
  if (!id) throw new Error("missing id");
  if (!originalName) throw new Error("missing original_name");
  const toolJson = String(formData.get("tool") ?? "");
  if (!toolJson) throw new Error("missing tool payload");

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolJson);
  } catch (e) {
    throw new Error(`tool is not valid JSON: ${(e as Error).message}`);
  }
  const tool = normalizeTool(parsed, 0);

  const row = await readSkillForToolEdit(id);
  const idx = row.tools_json.findIndex((t) => t.name === originalName);
  if (idx < 0) throw new Error(`tool "${originalName}" not found`);

  // If the name changed, ensure the new name doesn't collide.
  if (
    tool.name !== originalName &&
    row.tools_json.some((t, i) => i !== idx && t.name === tool.name)
  ) {
    throw new Error(`tool "${tool.name}" already exists`);
  }

  const before = row.tools_json[idx];
  const next = row.tools_json.slice();
  next[idx] = tool;
  await writeSkillTools(id, next, auth.userId);

  await recordAdminAction({
    action: "skill.tool_update",
    targetType: "ai_skill",
    targetId: id,
    before: { tool: before },
    after: { tool },
    metadata: { skill_id: id, tool_name: tool.name },
  });

  revalidatePath(`/admin/skills/${id}`);
}

export async function removeSkillTool(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id) throw new Error("missing id");
  if (!name) throw new Error("missing tool name");

  const row = await readSkillForToolEdit(id);
  const idx = row.tools_json.findIndex((t) => t.name === name);
  if (idx < 0) throw new Error(`tool "${name}" not found`);

  const removed = row.tools_json[idx];
  const next = row.tools_json.filter((_, i) => i !== idx);
  await writeSkillTools(id, next, auth.userId);

  await recordAdminAction({
    action: "skill.tool_remove",
    targetType: "ai_skill",
    targetId: id,
    before: { tool: removed },
    metadata: { skill_id: id, tool_name: name },
  });

  revalidatePath(`/admin/skills/${id}`);
}

/* ──────────────────── tool-overlay editor ────────────────────
 * For code-defined skills the source-defined tool list is locked to TS
 * code, but admins still need a way to tweak the description, mark a
 * tool read-only at runtime, or force user confirmation. We store these
 * tweaks in `agent_tool_overrides` keyed by the wildcard agent id —
 * the runtime applies them as a global default underneath any
 * per-agent override.
 *
 * The agent_tool_overrides table FKs `agent_id → ai_agents.id`. To
 * satisfy the FK with a sentinel "global" id we ensure a placeholder
 * row exists in ai_agents (status=disabled, kind=system, sort_order
 * far below zero so it never appears in admin lists). The placeholder
 * is invisible in /admin/agents because the page filters by status
 * and we keep its sort_order at -9999. */

const GLOBAL_AGENT_ID = "__global__";

async function ensureGlobalAgentExists(): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", GLOBAL_AGENT_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;
  const { error: insErr } = await admin.from("ai_agents").insert({
    id: GLOBAL_AGENT_ID,
    display_name: "(internal) Global tool overrides",
    description:
      "Sentinel agent row used by the admin panel to store global tool overrides. Not addressable by the runtime.",
    kind: "system",
    model: "claude-haiku-4-5-20251001",
    fast_model: "claude-haiku-4-5-20251001",
    system_prompt: "",
    greeting: "",
    allowed_skills: [],
    allowed_tools: [],
    temperature: 0,
    max_tokens: 1,
    status: "disabled",
    access_mode: "admin_only",
    access_tiers: [],
    access_roles: [],
    allowlist_user_ids: [],
    icon: null,
    sort_order: -9999,
    metadata: { internal: true, role: "global_tool_override_anchor" },
  });
  if (insErr) throw new Error(insErr.message);
}

const TOOL_LOOSE_NAME_RE = /^[a-z][a-z0-9_]*$/;

function pickNullableBool(raw: FormDataEntryValue | null): boolean | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "on" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  return null;
}

export async function setToolOverride(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const skillId = String(formData.get("skill_id") ?? "").trim();
  const toolName = String(formData.get("tool_name") ?? "").trim();
  if (!skillId) throw new Error("missing skill_id");
  if (!TOOL_LOOSE_NAME_RE.test(toolName)) {
    throw new Error("tool_name must be snake_case");
  }

  await ensureGlobalAgentExists();

  // Empty string -> null (clear that field's override).
  const rawDesc = formData.get("override_description");
  const override_description =
    rawDesc == null || String(rawDesc).trim() === ""
      ? null
      : String(rawDesc);

  const read_only_override = pickNullableBool(
    formData.get("read_only_override")
  );
  const requires_confirmation_override = pickNullableBool(
    formData.get("requires_confirmation_override")
  );
  const enabledRaw = formData.get("enabled");
  const enabled = enabledRaw == null ? true : pickNullableBool(enabledRaw) !== false;

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("agent_tool_overrides")
    .select("*")
    .eq("agent_id", GLOBAL_AGENT_ID)
    .eq("skill_id", skillId)
    .eq("tool_name", toolName)
    .maybeSingle();

  const upsertRow = {
    agent_id: GLOBAL_AGENT_ID,
    skill_id: skillId,
    tool_name: toolName,
    override_description,
    override_input_schema: null,
    read_only_override,
    requires_confirmation_override,
    enabled,
    metadata: {},
    updated_at: new Date().toISOString(),
    updated_by: auth.userId,
  };

  const { error } = await admin
    .from("agent_tool_overrides")
    .upsert(upsertRow, { onConflict: "agent_id,skill_id,tool_name" });
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "skill.tool_override_set",
    targetType: "ai_skill",
    targetId: skillId,
    before: (before as AgentToolOverrideRow | null) ?? null,
    after: upsertRow,
    metadata: {
      skill_id: skillId,
      tool_name: toolName,
      scope: "global",
    },
  });

  revalidatePath(`/admin/skills/${skillId}`);
}

export async function clearToolOverride(formData: FormData): Promise<void> {
  await assertAdmin();
  const skillId = String(formData.get("skill_id") ?? "").trim();
  const toolName = String(formData.get("tool_name") ?? "").trim();
  if (!skillId) throw new Error("missing skill_id");
  if (!toolName) throw new Error("missing tool_name");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("agent_tool_overrides")
    .select("*")
    .eq("agent_id", GLOBAL_AGENT_ID)
    .eq("skill_id", skillId)
    .eq("tool_name", toolName)
    .maybeSingle();

  if (!before) {
    // Nothing to clear — silently succeed so the UI is idempotent.
    return;
  }

  const { error } = await admin
    .from("agent_tool_overrides")
    .delete()
    .eq("agent_id", GLOBAL_AGENT_ID)
    .eq("skill_id", skillId)
    .eq("tool_name", toolName);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "skill.tool_override_clear",
    targetType: "ai_skill",
    targetId: skillId,
    before: before as AgentToolOverrideRow,
    metadata: {
      skill_id: skillId,
      tool_name: toolName,
      scope: "global",
    },
  });

  revalidatePath(`/admin/skills/${skillId}`);
}

/* ──────────────────── test runner ────────────────────
 * Asad's ask: a way to invoke a skill with sample input from the panel
 * and see what the runtime would return. Wiring all the way through to
 * `executeToolGuarded` is too coupled — the tool needs a UserContext
 * with a real Supabase client + auth user, and the admin panel's
 * service-role context can't impersonate. Instead we simulate: we
 * resolve the tool definition (code or custom), validate the JSON
 * input (best-effort), and render the prompt fragment + dispatch
 * payload that WOULD have been sent. Admins get to see exactly what
 * the runtime is wired to do without having to deploy and test live.
 */

type SkillTestSummary = {
  skill_id: string;
  tool_name: string;
  resolved: boolean;
  source: "code" | "custom" | null;
  description: string | null;
  read_only: boolean | null;
  requires_confirmation: boolean | null;
  input_schema: Record<string, unknown> | null;
  parsed_input: Record<string, unknown> | null;
  parse_error: string | null;
  dispatch:
    | { kind: "rpc"; rpc_name: string; rpc_arg: Record<string, unknown> | null }
    | { kind: "http"; url: string; body: Record<string, unknown> | null }
    | { kind: "code"; module: string }
    | null;
};

export async function runSkillTest(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const skillId = String(formData.get("skill_id") ?? "").trim();
  const toolName = String(formData.get("tool_name") ?? "").trim();
  const inputRaw = String(formData.get("input_json") ?? "").trim();

  if (!skillId) throw new Error("missing skill_id");
  if (!toolName) throw new Error("missing tool_name");

  let parsedInput: Record<string, unknown> | null = null;
  let parseError: string | null = null;
  if (inputRaw) {
    try {
      const v = JSON.parse(inputRaw);
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        parseError = "input_json must be a JSON object";
      } else {
        parsedInput = v as Record<string, unknown>;
      }
    } catch (e) {
      parseError = `input_json is not valid JSON: ${(e as Error).message}`;
    }
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("ai_skills")
    .select("*")
    .eq("id", skillId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error(`skill "${skillId}" not found`);

  const skill = row as AiSkillRow;

  let summary: SkillTestSummary;
  if (skill.kind === "code") {
    const reg = await readCodeSkillTools(skillId);
    const tool = reg?.tools.find((t) => t.name === toolName);
    summary = {
      skill_id: skillId,
      tool_name: toolName,
      resolved: !!tool,
      source: "code",
      description: tool?.description ?? null,
      read_only: tool?.read_only ?? null,
      requires_confirmation: null,
      input_schema: tool?.input_schema ?? null,
      parsed_input: parsedInput,
      parse_error: parseError,
      dispatch: tool
        ? { kind: "code", module: skill.handler_module ?? "(unknown)" }
        : null,
    };
  } else {
    const tool = skill.tools_json.find((t) => t.name === toolName);
    summary = {
      skill_id: skillId,
      tool_name: toolName,
      resolved: !!tool,
      source: "custom",
      description: tool?.description ?? null,
      read_only: tool?.read_only ?? null,
      requires_confirmation: tool?.requires_confirmation ?? null,
      input_schema: tool?.input_schema ?? null,
      parsed_input: parsedInput,
      parse_error: parseError,
      dispatch: tool
        ? tool.handler_kind === "rpc"
          ? { kind: "rpc", rpc_name: tool.handler_target, rpc_arg: parsedInput }
          : { kind: "http", url: tool.handler_target, body: parsedInput }
        : null,
    };
  }

  await recordAdminAction({
    action: "skill.test_run",
    targetType: "ai_skill",
    targetId: skillId,
    after: summary,
    metadata: {
      skill_id: skillId,
      tool_name: toolName,
      simulated: true,
      actor: auth.userId,
    },
  });

  // Stash the result in metadata on the skill row so the page can render it
  // on the next load. Lightweight — only the most-recent test is kept.
  const nextMeta: Record<string, unknown> = {
    ...(skill.metadata ?? {}),
    last_test: {
      at: new Date().toISOString(),
      by: auth.userId,
      ...summary,
    },
  };
  await admin
    .from("ai_skills")
    .update({
      metadata: nextMeta,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", skillId);

  revalidatePath(`/admin/skills/${skillId}`);
}

/* ──────────────────── bulk import ────────────────────
 * Paste a JSON array of skill rows; we upsert each one. Code-skill rows
 * are protected — bulk import won't change kind=code rows' tools_json
 * or handler_module (those are owned by source). Returns a summary in
 * the audit log so admins can see exactly what landed.
 */

type BulkImportPayload = {
  display_name?: unknown;
  description?: unknown;
  system_fragment?: unknown;
  status?: unknown;
  category?: unknown;
  icon?: unknown;
  sort_order?: unknown;
  allowed_workspace_roles?: unknown;
  requires_confirmation_default?: unknown;
  metadata?: unknown;
  tools_json?: unknown;
  handler_module?: unknown;
  kind?: unknown;
};

function pickStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function importSkillsJson(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const text = String(formData.get("payload") ?? "").trim();
  if (!text) throw new Error("missing payload");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`payload is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("payload must be a JSON array of skill rows");
  }

  const admin = createAdminClient();
  const inserted: string[] = [];
  const updated: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      skipped.push({ id: "(unknown)", reason: "row is not an object" });
      continue;
    }
    const r = item as { id?: unknown } & BulkImportPayload;
    const id = String(r.id ?? "").trim().toLowerCase();
    if (!id) {
      skipped.push({ id: "(unknown)", reason: "missing id" });
      continue;
    }
    if (!SKILL_ID_RE.test(id)) {
      skipped.push({ id, reason: "id must be lowercase alphanum/dot/underscore/hyphen" });
      continue;
    }

    const display_name = typeof r.display_name === "string" ? r.display_name.trim() : "";
    if (!display_name) {
      skipped.push({ id, reason: "missing display_name" });
      continue;
    }

    const description =
      typeof r.description === "string" ? r.description : "";
    const system_fragment =
      typeof r.system_fragment === "string" ? r.system_fragment : "";
    const status = pickStatus(r.status);
    const category =
      typeof r.category === "string" && r.category.trim()
        ? r.category.trim()
        : "general";
    const icon =
      typeof r.icon === "string" && r.icon.trim() ? r.icon.trim() : null;
    const sort_order = pickInt(r.sort_order, 0, -10000, 10000);
    const requires_confirmation_default =
      r.requires_confirmation_default === true;
    const rolesArr = pickStringArray(r.allowed_workspace_roles) ?? [];
    const allowed_workspace_roles = rolesArr.filter(
      (x): x is WorkspaceRole => ROLE_SET.has(x)
    ) as WorkspaceRole[];

    const metadata =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {};

    let tools_json: SkillToolDef[] = [];
    if (Array.isArray(r.tools_json)) {
      try {
        tools_json = r.tools_json.map((t, i) => normalizeTool(t, i));
        const seen = new Set<string>();
        for (const t of tools_json) {
          if (seen.has(t.name)) {
            throw new Error(`duplicate tool name "${t.name}"`);
          }
          seen.add(t.name);
        }
      } catch (e) {
        skipped.push({ id, reason: (e as Error).message });
        continue;
      }
    }

    const { data: existing, error: readErr } = await admin
      .from("ai_skills")
      .select("id, kind, tools_json, handler_module")
      .eq("id", id)
      .maybeSingle();
    if (readErr) {
      skipped.push({ id, reason: readErr.message });
      continue;
    }

    if (existing) {
      const kind = (existing as { kind: SkillKind }).kind;
      const finalTools =
        kind === "code"
          ? (existing as { tools_json: SkillToolDef[] }).tools_json
          : tools_json;
      const finalModule =
        kind === "code"
          ? (existing as { handler_module: string | null }).handler_module
          : typeof r.handler_module === "string"
            ? r.handler_module
            : null;
      const { error: upErr } = await admin
        .from("ai_skills")
        .update({
          display_name,
          description,
          system_fragment,
          status,
          handler_module: finalModule,
          tools_json: finalTools,
          allowed_workspace_roles,
          requires_confirmation_default,
          category,
          icon,
          sort_order,
          metadata,
          updated_by: auth.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (upErr) {
        skipped.push({ id, reason: upErr.message });
        continue;
      }
      updated.push(id);
    } else {
      const kind = pickKind(r.kind);
      if (kind === "code") {
        skipped.push({
          id,
          reason: "cannot insert kind='code' rows via import (must be wired in source)",
        });
        continue;
      }
      const handler_module =
        typeof r.handler_module === "string" ? r.handler_module : null;
      const { error: insErr } = await admin.from("ai_skills").insert({
        id,
        kind,
        display_name,
        description,
        system_fragment,
        status,
        handler_module,
        tools_json,
        allowed_workspace_roles,
        requires_confirmation_default,
        category,
        icon,
        sort_order,
        metadata,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      });
      if (insErr) {
        skipped.push({ id, reason: insErr.message });
        continue;
      }
      inserted.push(id);
    }
  }

  await recordAdminAction({
    action: "skill.bulk_import",
    targetType: "ai_skill",
    after: {
      inserted_count: inserted.length,
      updated_count: updated.length,
      skipped_count: skipped.length,
      inserted,
      updated,
      skipped,
    },
    metadata: {
      total: parsed.length,
      inserted_count: inserted.length,
      updated_count: updated.length,
      skipped_count: skipped.length,
    },
  });

  revalidatePath("/admin/skills");
}
