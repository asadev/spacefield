"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { AdminAlertRow, AlertConditionType } from "../_types";

/**
 * Server actions for `/admin/alerts`. Every action calls `assertAdmin()`
 * and `recordAdminAction(...)`.
 */

const VALID_CONDITION_TYPES: AlertConditionType[] = [
  "signup_drop",
  "webhook_failures",
  "error_rate",
  "cron_missed",
  "low_credit",
  "custom_query",
  "agent_failures",
  "storage_pct",
];

const VALID_CHANNELS = ["email", "telegram", "whatsapp"] as const;
type ActionChannel = (typeof VALID_CHANNELS)[number];

function parseConditionType(raw: unknown): AlertConditionType {
  const s = String(raw ?? "").trim();
  return (VALID_CONDITION_TYPES as string[]).includes(s)
    ? (s as AlertConditionType)
    : "signup_drop";
}

function parseConditionParams(formData: FormData): Record<string, unknown> {
  // Two encodings supported:
  //   1. Per-field inputs prefixed `cp_<key>` — assembled into JSON.
  //   2. A raw JSON textarea named `condition_params_json` — overrides
  //      everything else if present + valid.
  const rawJson = String(formData.get("condition_params_json") ?? "").trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error("condition_params JSON is not valid JSON");
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("cp_")) continue;
    const key = k.slice(3);
    const str = String(v ?? "").trim();
    if (!str) continue;
    // Try a number coercion; fall back to string if NaN.
    const n = Number(str);
    out[key] = Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(str) ? n : str;
  }
  return out;
}

function parseChannels(formData: FormData): ActionChannel[] {
  const out: ActionChannel[] = [];
  for (const v of formData.getAll("action_channels")) {
    const s = String(v);
    if ((VALID_CHANNELS as readonly string[]).includes(s)) {
      out.push(s as ActionChannel);
    }
  }
  return out;
}

function parseRecipients(raw: unknown): string[] {
  const text = String(raw ?? "");
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ────────────────────── createAlert ────────────────────── */

export async function createAlert(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("name required");

  const condition_type = parseConditionType(formData.get("condition_type"));
  const condition_params = parseConditionParams(formData);
  const action_channels = parseChannels(formData);
  const action_recipients = parseRecipients(formData.get("action_recipients"));
  const description = String(formData.get("description") ?? "").trim();
  const cooldown_minutes = clampInt(
    formData.get("cooldown_minutes"),
    1,
    24 * 60,
    30
  );
  const enabled = formData.get("enabled") === "on";

  const admin = createAdminClient();
  const insertRow = {
    name,
    description,
    condition_type,
    condition_params,
    action_channels,
    action_recipients,
    cooldown_minutes,
    enabled,
    updated_by: auth.userId,
  };

  const { data, error } = await admin
    .from("admin_alerts")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");

  await recordAdminAction({
    action: "alert.create",
    targetType: "admin_alert",
    targetId: (data as { id: string }).id,
    after: { id: (data as { id: string }).id, ...insertRow },
  });

  revalidatePath("/admin/alerts");
  redirect(`/admin/alerts/${(data as { id: string }).id}`);
}

/* ────────────────────── updateAlert ────────────────────── */

export async function updateAlert(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("name required");

  const condition_type = parseConditionType(formData.get("condition_type"));
  const condition_params = parseConditionParams(formData);
  const action_channels = parseChannels(formData);
  const action_recipients = parseRecipients(formData.get("action_recipients"));
  const description = String(formData.get("description") ?? "").trim();
  const cooldown_minutes = clampInt(
    formData.get("cooldown_minutes"),
    1,
    24 * 60,
    30
  );
  const enabled = formData.get("enabled") === "on";

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("admin_alerts")
    .select("*")
    .eq("id", id)
    .maybeSingle<AdminAlertRow>();

  const update = {
    name,
    description,
    condition_type,
    condition_params,
    action_channels,
    action_recipients,
    cooldown_minutes,
    enabled,
    updated_by: auth.userId,
  };

  const { error } = await admin
    .from("admin_alerts")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "alert.update",
    targetType: "admin_alert",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/alerts");
  revalidatePath(`/admin/alerts/${id}`);
}

/* ────────────────────── setAlertEnabled ────────────────────── */

export async function setAlertEnabled(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const next = String(formData.get("enabled") ?? "false") === "true";

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("admin_alerts")
    .select("id, name, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("admin_alerts")
    .update({ enabled: next, updated_by: auth.userId })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "alert.toggle",
    targetType: "admin_alert",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/alerts");
  revalidatePath(`/admin/alerts/${id}`);
}

/* ────────────────────── deleteAlert ────────────────────── */

export async function deleteAlert(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("admin_alerts")
    .select("*")
    .eq("id", id)
    .maybeSingle<AdminAlertRow>();

  const { error } = await admin.from("admin_alerts").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "alert.delete",
    targetType: "admin_alert",
    targetId: id,
    before,
  });

  revalidatePath("/admin/alerts");
  redirect("/admin/alerts");
}
