"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

const PROTOCOLS = ["saml", "oidc", "google", "microsoft"] as const;
type Protocol = (typeof PROTOCOLS)[number];

const STATUSES = ["pending", "active", "disabled", "failed"] as const;
type SsoStatus = (typeof STATUSES)[number];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseProtocol(raw: unknown): Protocol {
  const s = String(raw ?? "").toLowerCase();
  return (PROTOCOLS as readonly string[]).includes(s)
    ? (s as Protocol)
    : "saml";
}

function parseStatus(raw: unknown): SsoStatus {
  const s = String(raw ?? "").toLowerCase();
  return (STATUSES as readonly string[]).includes(s)
    ? (s as SsoStatus)
    : "pending";
}

function parseWorkspaceId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "_global") return null;
  if (!UUID_REGEX.test(s)) {
    throw new Error("workspace_id must be a UUID (or empty for global)");
  }
  return s;
}

function nullableTrim(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s.length > 0 ? s : null;
}

/* ────────────────────── createConfig ────────────────────── */

export async function createConfig(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const workspace_id = parseWorkspaceId(formData.get("workspace_id"));
  const protocol = parseProtocol(formData.get("protocol"));
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("display_name is required");

  const insertRow = {
    workspace_id,
    protocol,
    display_name,
    entity_id: nullableTrim(formData.get("entity_id")),
    sso_url: nullableTrim(formData.get("sso_url")),
    certificate: nullableTrim(formData.get("certificate")),
    client_id: nullableTrim(formData.get("client_id")),
    client_secret_env: nullableTrim(formData.get("client_secret_env")),
    metadata_xml: nullableTrim(formData.get("metadata_xml")),
    status: parseStatus(formData.get("status")),
    updated_by: auth.userId,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sso_configs")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "sso.create",
    targetType: "sso_config",
    targetId: data?.id ?? null,
    after: insertRow,
  });

  revalidatePath("/admin/sso");
  redirect(`/admin/sso/${data?.id ?? ""}`);
}

/* ────────────────────── updateConfig ────────────────────── */

export async function updateConfig(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const workspace_id = parseWorkspaceId(formData.get("workspace_id"));
  const protocol = parseProtocol(formData.get("protocol"));
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("display_name is required");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("sso_configs")
    .select(
      "id, workspace_id, protocol, display_name, entity_id, sso_url, certificate, client_id, client_secret_env, metadata_xml, status"
    )
    .eq("id", id)
    .maybeSingle();

  const update = {
    workspace_id,
    protocol,
    display_name,
    entity_id: nullableTrim(formData.get("entity_id")),
    sso_url: nullableTrim(formData.get("sso_url")),
    certificate: nullableTrim(formData.get("certificate")),
    client_id: nullableTrim(formData.get("client_id")),
    client_secret_env: nullableTrim(formData.get("client_secret_env")),
    metadata_xml: nullableTrim(formData.get("metadata_xml")),
    status: parseStatus(formData.get("status")),
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("sso_configs")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "sso.update",
    targetType: "sso_config",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/sso");
  revalidatePath(`/admin/sso/${id}`);
}

/* ────────────────────── setStatus ────────────────────── */

export async function setStatus(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = parseStatus(formData.get("status"));
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("sso_configs")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("sso_configs")
    .update({
      status,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "sso.set_status",
    targetType: "sso_config",
    targetId: id,
    before,
    after: { id, status },
  });

  revalidatePath("/admin/sso");
  revalidatePath(`/admin/sso/${id}`);
}

/* ────────────────────── deleteConfig ────────────────────── */

export async function deleteConfig(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("sso_configs")
    .select(
      "id, workspace_id, protocol, display_name, entity_id, sso_url, client_id, client_secret_env, status"
    )
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("sso_configs")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "sso.delete",
    targetType: "sso_config",
    targetId: id,
    before,
  });

  revalidatePath("/admin/sso");
  redirect("/admin/sso");
}
