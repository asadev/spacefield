"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { PromptLibraryRow, PromptVersionRow } from "../_types";

/**
 * Server actions for the Prompt library admin UI. Mirrors
 * skills/_actions.ts in shape: every mutation calls assertAdmin(),
 * validates inputs, writes via the service-role client, and records an
 * audit row.
 *
 * Audit conventions:
 *   prompt.create, prompt.update, prompt.delete, prompt.status_change,
 *   prompt.version_create, prompt.version_promote.
 */

type PromptStatus = "live" | "draft" | "archived";

const STATUSES: ReadonlySet<PromptStatus> = new Set([
  "live",
  "draft",
  "archived",
]);

const PROMPT_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

/* ──────────────────── helpers ──────────────────── */

function pickStatus(raw: unknown): PromptStatus {
  const v = String(raw ?? "draft");
  return STATUSES.has(v as PromptStatus) ? (v as PromptStatus) : "draft";
}

function parseTags(raw: unknown): string[] {
  const s = String(raw ?? "");
  return Array.from(
    new Set(
      s
        .split(/[,\n]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  );
}

function parseVariables(raw: unknown): string[] {
  const s = String(raw ?? "");
  return Array.from(
    new Set(
      s
        .split(/[\s,\n]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  );
}

/** Parse `{{var}}` patterns out of a body string. */
async function extractVariablesFromBody(body: string): Promise<string[]> {
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.add(m[1]);
  }
  return Array.from(out).sort();
}

type PromptEditPayload = {
  display_name: string;
  description: string;
  category: string;
  tags: string[];
  status: PromptStatus;
};

function readEditPayload(formData: FormData): PromptEditPayload {
  const display_name = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "general").trim() || "general";
  const tags = parseTags(formData.get("tags"));
  const status = pickStatus(formData.get("status"));
  return { display_name, description, category, tags, status };
}

function diffPromptBefore(row: PromptLibraryRow | null) {
  if (!row) return null;
  const { created_at: _c, updated_at: _u, ...rest } = row;
  void _c;
  void _u;
  return rest;
}

async function readPromptOrThrow(id: string): Promise<PromptLibraryRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prompt_library")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`prompt "${id}" not found`);
  return data as PromptLibraryRow;
}

async function maxVersionFor(id: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prompt_versions")
    .select("version")
    .eq("prompt_id", id)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0] as { version: number } | undefined;
  return row?.version ?? 0;
}

/* ──────────────────── createPrompt ──────────────────── */

export async function createPrompt(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (id.length > 64) throw new Error("id must be ≤ 64 characters");
  if (!PROMPT_ID_RE.test(id)) {
    throw new Error(
      "id must be lowercase letters/digits/dot/underscore/hyphen (start alphanum)"
    );
  }

  const payload = readEditPayload(formData);
  if (!payload.display_name) throw new Error("missing display_name");

  const body = String(formData.get("body") ?? "");
  if (!body.trim()) throw new Error("missing body — first version requires content");

  // Variables: prefer the explicit list, fall back to body-extracted.
  const explicitVars = parseVariables(formData.get("variables"));
  const extractedVars = await extractVariablesFromBody(body);
  const variables = explicitVars.length > 0 ? explicitVars : extractedVars;

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("prompt_library")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) throw new Error(`prompt id "${id}" already exists`);

  // Insert prompt_library row first.
  const insertRow = {
    id,
    display_name: payload.display_name,
    description: payload.description,
    category: payload.category,
    tags: payload.tags,
    current_version: 1,
    status: payload.status,
  };

  const { data: insertedRow, error: insErr } = await admin
    .from("prompt_library")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (insErr) throw new Error(insErr.message);

  // Insert first prompt_versions row.
  const { error: verErr } = await admin.from("prompt_versions").insert({
    prompt_id: id,
    version: 1,
    body,
    variables,
    notes: "Initial version",
    created_by: auth.userId,
  });
  if (verErr) {
    // Roll back the prompt_library row to avoid orphans.
    await admin.from("prompt_library").delete().eq("id", id);
    throw new Error(verErr.message);
  }

  await recordAdminAction({
    action: "prompt.create",
    targetType: "prompt_library",
    targetId: id,
    after: diffPromptBefore(insertedRow as PromptLibraryRow | null) ?? insertRow,
    metadata: { initial_version: 1, body_length: body.length },
  });

  revalidatePath("/admin/prompts");
  revalidatePath(`/admin/prompts/${id}`);
  redirect(`/admin/prompts/${id}`);
}

/* ──────────────────── updatePrompt ──────────────────── */

export async function updatePrompt(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await readPromptOrThrow(id);
  const payload = readEditPayload(formData);
  if (!payload.display_name) throw new Error("missing display_name");

  const admin = createAdminClient();
  const updates = {
    display_name: payload.display_name,
    description: payload.description,
    category: payload.category,
    tags: payload.tags,
    status: payload.status,
  };

  const { data: after, error: updErr } = await admin
    .from("prompt_library")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "prompt.update",
    targetType: "prompt_library",
    targetId: id,
    before: diffPromptBefore(before),
    after: diffPromptBefore(after as PromptLibraryRow | null) ?? updates,
  });

  revalidatePath("/admin/prompts");
  revalidatePath(`/admin/prompts/${id}`);
}

/* ──────────────────── deletePrompt ──────────────────── */

export async function deletePrompt(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await readPromptOrThrow(id);

  const admin = createAdminClient();
  // Versions go first so we don't leave orphans even if the row delete
  // races with another operation.
  const { error: vErr } = await admin
    .from("prompt_versions")
    .delete()
    .eq("prompt_id", id);
  if (vErr) throw new Error(vErr.message);

  const { error: dErr } = await admin
    .from("prompt_library")
    .delete()
    .eq("id", id);
  if (dErr) throw new Error(dErr.message);

  await recordAdminAction({
    action: "prompt.delete",
    targetType: "prompt_library",
    targetId: id,
    before: diffPromptBefore(before),
  });

  revalidatePath("/admin/prompts");
  redirect("/admin/prompts");
}

/* ──────────────────── setStatus ──────────────────── */

export async function setStatus(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = pickStatus(formData.get("status"));
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("prompt_library")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`prompt "${id}" not found`);

  const before = (existing as { status: PromptStatus }).status;
  if (before === status) return;

  const { error: updErr } = await admin
    .from("prompt_library")
    .update({ status })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "prompt.status_change",
    targetType: "prompt_library",
    targetId: id,
    before: { status: before },
    after: { status },
  });

  revalidatePath("/admin/prompts");
  revalidatePath(`/admin/prompts/${id}`);
}

/* ──────────────────── createVersion ──────────────────── */

export async function createVersion(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const body = String(formData.get("body") ?? "");
  if (!body.trim()) throw new Error("missing body");

  const notes = String(formData.get("notes") ?? "").trim() || null;
  const promote = formData.get("promote") != null;

  // Variables: explicit list or body-extracted fallback.
  const explicitVars = parseVariables(formData.get("variables"));
  const extractedVars = await extractVariablesFromBody(body);
  const variables = explicitVars.length > 0 ? explicitVars : extractedVars;

  const admin = createAdminClient();
  const before = await readPromptOrThrow(id);
  const max = await maxVersionFor(id);
  const nextVersion = max + 1;

  // Insert the new prompt_versions row.
  const { error: insErr } = await admin.from("prompt_versions").insert({
    prompt_id: id,
    version: nextVersion,
    body,
    variables,
    notes,
    created_by: auth.userId,
  });
  if (insErr) throw new Error(insErr.message);

  if (promote) {
    const { error: upErr } = await admin
      .from("prompt_library")
      .update({ current_version: nextVersion })
      .eq("id", id);
    if (upErr) throw new Error(upErr.message);
  }

  await recordAdminAction({
    action: "prompt.version_create",
    targetType: "prompt_library",
    targetId: id,
    before: { current_version: before.current_version },
    after: {
      version: nextVersion,
      promoted: promote,
      current_version: promote ? nextVersion : before.current_version,
    },
    metadata: { body_length: body.length, variables_count: variables.length },
  });

  revalidatePath(`/admin/prompts/${id}`);
}

/* ──────────────────── promoteVersion ──────────────────── */

export async function promoteVersion(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const versionRaw = String(formData.get("version") ?? "");
  const version = Number.parseInt(versionRaw, 10);
  if (!Number.isFinite(version) || version <= 0) {
    throw new Error("invalid version");
  }

  const admin = createAdminClient();
  const before = await readPromptOrThrow(id);

  // Verify version exists.
  const { data: ver, error: vErr } = await admin
    .from("prompt_versions")
    .select("version")
    .eq("prompt_id", id)
    .eq("version", version)
    .maybeSingle();
  if (vErr) throw new Error(vErr.message);
  if (!ver) throw new Error(`version ${version} does not exist for prompt "${id}"`);

  if (before.current_version === version) return;

  const { error: upErr } = await admin
    .from("prompt_library")
    .update({ current_version: version })
    .eq("id", id);
  if (upErr) throw new Error(upErr.message);

  await recordAdminAction({
    action: "prompt.version_promote",
    targetType: "prompt_library",
    targetId: id,
    before: { current_version: before.current_version },
    after: { current_version: version },
  });

  revalidatePath(`/admin/prompts/${id}`);
}

/* ──────────────────── deleteVersion ──────────────────── */
/* Rare path — only allowed for non-current versions to avoid orphaning
 * the current_version pointer. Useful for pruning old draft versions. */

export async function deleteVersion(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const versionRaw = String(formData.get("version") ?? "");
  const version = Number.parseInt(versionRaw, 10);
  if (!Number.isFinite(version) || version <= 0) {
    throw new Error("invalid version");
  }

  const before = await readPromptOrThrow(id);
  if (before.current_version === version) {
    throw new Error("cannot delete the current version — promote another first");
  }

  const admin = createAdminClient();
  const { data: existingVer, error: readErr } = await admin
    .from("prompt_versions")
    .select("*")
    .eq("prompt_id", id)
    .eq("version", version)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existingVer) throw new Error(`version ${version} does not exist`);

  const { error: dErr } = await admin
    .from("prompt_versions")
    .delete()
    .eq("prompt_id", id)
    .eq("version", version);
  if (dErr) throw new Error(dErr.message);

  await recordAdminAction({
    action: "prompt.version_delete",
    targetType: "prompt_library",
    targetId: id,
    before: { version, body_length: (existingVer as PromptVersionRow).body.length },
  });

  revalidatePath(`/admin/prompts/${id}`);
}
