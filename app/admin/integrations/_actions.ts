"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

import type { IntegrationRow } from "../_types";

/**
 * Server actions for `/admin/integrations`. Every action calls
 * `assertAdmin()` AND `recordAdminAction(...)`.
 */

const ID_REGEX = /^[a-z0-9][a-z0-9_-]*$/;
const STATUSES: IntegrationRow["status"][] = [
  "available",
  "beta",
  "disabled",
  "deprecated",
];

function parseStatus(raw: unknown): IntegrationRow["status"] {
  const s = String(raw ?? "").trim();
  return (STATUSES as string[]).includes(s)
    ? (s as IntegrationRow["status"])
    : "available";
}

/** Lines → trimmed unique env-var names. Validates roughly: A-Z, 0-9, _.
 *  Empty input ⇒ empty array. */
function parseEnvLines(raw: unknown): string[] {
  const text = String(raw ?? "");
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function parseOauthConfig(
  raw: unknown
): Record<string, unknown> | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("oauth_config JSON is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("oauth_config must be a JSON object (or empty)");
  }
  return parsed as Record<string, unknown>;
}

/* ────────────────────── createIntegration ────────────────────── */

export async function createIntegration(
  formData: FormData
): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (!ID_REGEX.test(id)) {
    throw new Error("id must be lowercase letters, digits, hyphens, underscores");
  }
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("display_name required");

  const category = String(formData.get("category") ?? "").trim() || "general";
  const description = String(formData.get("description") ?? "").trim();
  const logo_url = String(formData.get("logo_url") ?? "").trim() || null;
  const homepage_url =
    String(formData.get("homepage_url") ?? "").trim() || null;
  const status = parseStatus(formData.get("status"));
  const required_env = parseEnvLines(formData.get("required_env"));
  const oauth_config = parseOauthConfig(formData.get("oauth_config"));
  const enabled = formData.get("enabled") === "on";

  const admin = createAdminClient();
  const insertRow = {
    id,
    display_name,
    category,
    description,
    logo_url,
    homepage_url,
    status,
    required_env,
    oauth_config,
    enabled,
    updated_by: auth.userId,
  };
  const { error } = await admin.from("integrations").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "integration.create",
    targetType: "integration",
    targetId: id,
    after: insertRow,
  });

  revalidatePath("/admin/integrations");
  redirect(`/admin/integrations/${encodeURIComponent(id)}`);
}

/* ────────────────────── updateIntegration ────────────────────── */

export async function updateIntegration(
  formData: FormData
): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");

  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("display_name required");
  const category = String(formData.get("category") ?? "").trim() || "general";
  const description = String(formData.get("description") ?? "").trim();
  const logo_url = String(formData.get("logo_url") ?? "").trim() || null;
  const homepage_url =
    String(formData.get("homepage_url") ?? "").trim() || null;
  const status = parseStatus(formData.get("status"));
  const required_env = parseEnvLines(formData.get("required_env"));
  const oauth_config = parseOauthConfig(formData.get("oauth_config"));
  const enabled = formData.get("enabled") === "on";

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("integrations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const update = {
    display_name,
    category,
    description,
    logo_url,
    homepage_url,
    status,
    required_env,
    oauth_config,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("integrations")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "integration.update",
    targetType: "integration",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/integrations");
  revalidatePath(`/admin/integrations/${encodeURIComponent(id)}`);
}

/* ────────────────────── toggleIntegration ────────────────────── */

export async function toggleIntegration(
  formData: FormData
): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  const next = String(formData.get("enabled") ?? "false") === "true";

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("integrations")
    .select("id, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("integrations")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "integration.toggle",
    targetType: "integration",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/integrations");
  revalidatePath(`/admin/integrations/${encodeURIComponent(id)}`);
}

/* ────────────────────── deleteIntegration ────────────────────── */

export async function deleteIntegration(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("integrations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("integrations").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "integration.delete",
    targetType: "integration",
    targetId: id,
    before,
  });

  revalidatePath("/admin/integrations");
  redirect("/admin/integrations");
}
