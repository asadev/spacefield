"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { FeatureFlagRow, FeatureRollout } from "../_types";

/**
 * Server actions for `/admin/features`. Every action calls
 * `assertAdmin()` (also enforced by RLS) and `recordAdminAction(...)`
 * so the audit log captures every change.
 */

const KEY_REGEX = /^[a-z][a-z0-9_.]*$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLLOUTS: FeatureRollout[] = ["off", "on", "allowlist", "percent"];

function parseRollout(value: unknown): FeatureRollout {
  const s = String(value ?? "off").toLowerCase();
  return (ROLLOUTS as string[]).includes(s)
    ? (s as FeatureRollout)
    : "off";
}

/** Split textarea on newlines, trim, drop empties, drop dupes, keep
 *  only valid UUIDs. */
function parseUuidLines(raw: unknown): string[] {
  const text = String(raw ?? "");
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!UUID_REGEX.test(trimmed)) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function clampPercent(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/* ────────────────── createFlag ────────────────── */

export async function createFlag(
  formData: FormData
): Promise<void> {
  const auth = await assertAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!key) throw new Error("missing key");
  if (!KEY_REGEX.test(key)) {
    throw new Error(
      "invalid key — use lowercase letters, digits, dots, underscores"
    );
  }

  const admin = createAdminClient();
  const insertRow = {
    key,
    title: title || key,
    description,
    enabled: false,
    rollout: "off" as FeatureRollout,
    rollout_percent: 0,
    allowlist_user_ids: [] as string[],
    allowlist_workspace_ids: [] as string[],
    updated_by: auth.userId,
  };

  const { error } = await admin.from("feature_flags").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "feature.create",
    targetType: "feature_flag",
    targetId: key,
    after: insertRow,
  });

  revalidatePath("/admin/features");
  redirect(`/admin/features/${encodeURIComponent(key)}`);
}

/* ────────────────── updateFlag ────────────────── */

export async function updateFlag(
  formData: FormData
): Promise<void> {
  const auth = await assertAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  if (!key) throw new Error("missing key");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const enabled = formData.get("enabled") === "on";
  const rollout = parseRollout(formData.get("rollout"));
  const rollout_percent = clampPercent(formData.get("rollout_percent"));
  const allowlist_user_ids = parseUuidLines(
    formData.get("allowlist_user_ids")
  );
  const allowlist_workspace_ids = parseUuidLines(
    formData.get("allowlist_workspace_ids")
  );

  const admin = createAdminClient();

  // Read before-state for audit diff
  const { data: before } = await admin
    .from("feature_flags")
    .select(
      "key, title, description, enabled, rollout, rollout_percent, allowlist_user_ids, allowlist_workspace_ids"
    )
    .eq("key", key)
    .maybeSingle();

  const update = {
    title: title || key,
    description,
    enabled,
    rollout,
    rollout_percent,
    allowlist_user_ids,
    allowlist_workspace_ids,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("feature_flags")
    .update(update)
    .eq("key", key);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "feature.update",
    targetType: "feature_flag",
    targetId: key,
    before,
    after: { key, ...update },
  });

  revalidatePath("/admin/features");
  revalidatePath(`/admin/features/${encodeURIComponent(key)}`);
}

/* ────────────────── toggleFlag ────────────────── */

export async function toggleFlag(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  const next = String(formData.get("enabled") ?? "false") === "true";
  if (!key) throw new Error("missing key");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("feature_flags")
    .select("key, enabled")
    .eq("key", key)
    .maybeSingle();

  const { error } = await admin
    .from("feature_flags")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "feature.toggle",
    targetType: "feature_flag",
    targetId: key,
    before,
    after: { key, enabled: next },
  });

  revalidatePath("/admin/features");
  revalidatePath(`/admin/features/${encodeURIComponent(key)}`);
}

/* ────────────────── deleteFlag ────────────────── */

export async function deleteFlag(formData: FormData): Promise<void> {
  await assertAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  if (!key) throw new Error("missing key");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("feature_flags")
    .select(
      "key, title, description, enabled, rollout, rollout_percent, allowlist_user_ids, allowlist_workspace_ids"
    )
    .eq("key", key)
    .maybeSingle();

  const { error } = await admin
    .from("feature_flags")
    .delete()
    .eq("key", key);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "feature.delete",
    targetType: "feature_flag",
    targetId: key,
    before,
  });

  revalidatePath("/admin/features");
  redirect("/admin/features");
}

// FeatureFlagRow is intentionally NOT re-exported here — `"use server"`
// modules can only export async functions. Importers should pull the
// type from `@/app/admin/_types` directly.

