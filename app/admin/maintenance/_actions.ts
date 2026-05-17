"use server";

import { revalidatePath, updateTag } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache/single-flight";
import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { MaintenanceStateRow } from "../_types";

/**
 * Server actions for /admin/maintenance.
 *
 *   updateMaintenance    → patch the singleton row (id=1)
 *   enableMaintenance    → quick toggle: enabled = true
 *   disableMaintenance   → quick toggle: enabled = false
 *
 * All call assertAdmin() AND recordAdminAction(...). The
 * confirmation UX lives in the client wrapper around these forms.
 *
 * Audit verbs: maintenance.update, maintenance.enable, maintenance.disable.
 */

function parseLines(value: unknown): string[] {
  return String(value ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTimestamp(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchMaintenance(): Promise<MaintenanceStateRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("maintenance_state")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return (data as MaintenanceStateRow | null) ?? null;
}

/* ─────────────────────── full update ─────────────────────── */

export async function updateMaintenance(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();

  // The form double-confirms via a hidden input. Without it we refuse —
  // belt + suspenders for a switch this dangerous.
  if (formData.get("confirm") !== "yes") {
    throw new Error("missing confirmation");
  }

  const before = await fetchMaintenance();
  if (!before) throw new Error("maintenance row missing — migration not applied");

  const enabled =
    formData.get("enabled") === "on" || formData.get("enabled") === "true";
  const message = String(formData.get("message") ?? "");
  const read_only =
    formData.get("read_only") === "on" || formData.get("read_only") === "true";
  const allowlist_user_ids = parseLines(formData.get("allowlist_user_ids"));
  const starts_at = parseTimestamp(formData.get("starts_at"));
  const ends_at = parseTimestamp(formData.get("ends_at"));

  const patch = {
    enabled,
    message,
    read_only,
    allowlist_user_ids,
    starts_at,
    ends_at,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("maintenance_state")
    .update(patch)
    .eq("id", 1);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "maintenance.update",
    targetType: "maintenance_state",
    targetId: "1",
    before: {
      enabled: before.enabled,
      message: before.message,
      read_only: before.read_only,
      allowlist_user_ids: before.allowlist_user_ids,
      starts_at: before.starts_at,
      ends_at: before.ends_at,
    },
    after: {
      enabled,
      message,
      read_only,
      allowlist_user_ids,
      starts_at,
      ends_at,
    },
  });

  revalidatePath("/admin/maintenance");
  updateTag(CACHE_TAGS.maintenance);
}

/* ─────────────────────── quick toggles ─────────────────────── */

export async function enableMaintenance(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  if (formData.get("confirm") !== "yes") {
    throw new Error("missing confirmation");
  }
  const before = await fetchMaintenance();
  if (!before) throw new Error("maintenance row missing");

  const admin = createAdminClient();
  const { error } = await admin
    .from("maintenance_state")
    .update({
      enabled: true,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "maintenance.enable",
    targetType: "maintenance_state",
    targetId: "1",
    before: { enabled: before.enabled },
    after: { enabled: true },
  });

  revalidatePath("/admin/maintenance");
  updateTag(CACHE_TAGS.maintenance);
}

export async function disableMaintenance(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  if (formData.get("confirm") !== "yes") {
    throw new Error("missing confirmation");
  }
  const before = await fetchMaintenance();
  if (!before) throw new Error("maintenance row missing");

  const admin = createAdminClient();
  const { error } = await admin
    .from("maintenance_state")
    .update({
      enabled: false,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "maintenance.disable",
    targetType: "maintenance_state",
    targetId: "1",
    before: { enabled: before.enabled },
    after: { enabled: false },
  });

  revalidatePath("/admin/maintenance");
  updateTag(CACHE_TAGS.maintenance);
}
