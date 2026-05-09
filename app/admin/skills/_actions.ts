"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import {
  WORKSPACE_ROLES,
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
