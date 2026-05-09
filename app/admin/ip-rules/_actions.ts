"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

const CIDR_REGEX = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;

function parseAction(raw: unknown): "allow" | "block" {
  const s = String(raw ?? "block").toLowerCase();
  return s === "allow" ? "allow" : "block";
}

function parseCidr(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) throw new Error("missing CIDR");
  if (!CIDR_REGEX.test(s)) {
    throw new Error(
      "invalid CIDR — expected IPv4 form like 1.2.3.4 or 10.0.0.0/24"
    );
  }
  // Validate octet ranges
  const [host, mask] = s.split("/");
  for (const octet of host.split(".")) {
    const n = Number(octet);
    if (!Number.isFinite(n) || n < 0 || n > 255) {
      throw new Error(`invalid octet "${octet}" in ${s}`);
    }
  }
  if (mask !== undefined) {
    const m = Number(mask);
    if (!Number.isFinite(m) || m < 0 || m > 32) {
      throw new Error(`invalid mask /${mask} in ${s}`);
    }
  }
  return s;
}

function parseExpiresAt(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T23:59:59.999Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* ────────────────────── createRule ────────────────────── */

export async function createRule(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const cidr = parseCidr(formData.get("cidr"));
  const action = parseAction(formData.get("action"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const expires_at = parseExpiresAt(formData.get("expires_at"));
  const enabled = formData.get("enabled") !== "off";

  const insertRow = {
    cidr,
    action,
    reason,
    expires_at,
    enabled,
    updated_by: auth.userId,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ip_rules")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "ip_rule.create",
    targetType: "ip_rule",
    targetId: data?.id ?? null,
    after: insertRow,
  });

  revalidatePath("/admin/ip-rules");
  redirect("/admin/ip-rules");
}

/* ────────────────────── updateRule ────────────────────── */

export async function updateRule(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const cidr = parseCidr(formData.get("cidr"));
  const action = parseAction(formData.get("action"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const expires_at = parseExpiresAt(formData.get("expires_at"));
  const enabled = formData.get("enabled") !== "off";

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("ip_rules")
    .select("id, cidr, action, reason, expires_at, enabled")
    .eq("id", id)
    .maybeSingle();

  const update = {
    cidr,
    action,
    reason,
    expires_at,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("ip_rules")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "ip_rule.update",
    targetType: "ip_rule",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/ip-rules");
  revalidatePath(`/admin/ip-rules/${id}`);
}

/* ────────────────────── toggleRule ────────────────────── */

export async function toggleRule(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const next = String(formData.get("enabled") ?? "false") === "true";
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("ip_rules")
    .select("id, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("ip_rules")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "ip_rule.toggle",
    targetType: "ip_rule",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/ip-rules");
}

/* ────────────────────── deleteRule ────────────────────── */

export async function deleteRule(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("ip_rules")
    .select("id, cidr, action, reason, expires_at, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("ip_rules")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "ip_rule.delete",
    targetType: "ip_rule",
    targetId: id,
    before,
  });

  revalidatePath("/admin/ip-rules");
  redirect("/admin/ip-rules");
}
