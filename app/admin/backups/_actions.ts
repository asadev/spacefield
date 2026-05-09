"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { BackupSnapshotRow } from "../_types";

/**
 * Server actions for `/admin/backups`. Every action calls `assertAdmin()`
 * AND `recordAdminAction(...)`.
 *
 * The actual backup mechanism is environmental (pg_dump cron / managed
 * Supabase backup). These actions stamp the status machine + audit log,
 * which is what the v3 contract specifies.
 */

const VALID_SCOPES: BackupSnapshotRow["scope"][] = [
  "full",
  "workspace",
  "table",
];

function parseScope(raw: unknown): BackupSnapshotRow["scope"] {
  const s = String(raw ?? "").trim();
  return (VALID_SCOPES as string[]).includes(s)
    ? (s as BackupSnapshotRow["scope"])
    : "full";
}

/* ─────────────── triggerBackup ─────────────── */

export async function triggerBackup(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const scope = parseScope(formData.get("scope"));
  const scopeTarget = String(formData.get("scope_target") ?? "").trim() || null;

  // Manual backups always start in pending. Some external worker is
  // expected to flip them to running → completed via markCompleted.
  const insertRow = {
    kind: "manual" as BackupSnapshotRow["kind"],
    scope,
    scope_target: scopeTarget,
    status: "pending" as BackupSnapshotRow["status"],
    triggered_by: auth.userId,
    metadata: {
      requested_at: new Date().toISOString(),
      requested_by_email: auth.email,
    },
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("backup_snapshots")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");

  await recordAdminAction({
    action: "backup.trigger",
    targetType: "backup_snapshot",
    targetId: (data as { id: string }).id,
    after: { id: (data as { id: string }).id, ...insertRow },
  });

  revalidatePath("/admin/backups");
}

/* ─────────────── markCompleted ─────────────── */

export async function markCompleted(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const storageUrlRaw = String(formData.get("storage_url") ?? "").trim();
  const sizeBytesRaw = String(formData.get("size_bytes") ?? "").trim();
  const sizeBytes = sizeBytesRaw ? Math.max(0, Number(sizeBytesRaw)) : null;

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("backup_snapshots")
    .select("*")
    .eq("id", id)
    .maybeSingle<BackupSnapshotRow>();
  if (!before) throw new Error("not found");

  const update = {
    status: "completed" as BackupSnapshotRow["status"],
    storage_url:
      storageUrlRaw || `https://backups.spacefield.local/${id}.dump`,
    size_bytes:
      sizeBytes !== null && Number.isFinite(sizeBytes) ? sizeBytes : null,
    finished_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("backup_snapshots")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "backup.mark_completed",
    targetType: "backup_snapshot",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/backups");
}

/* ─────────────── markFailed ─────────────── */

export async function markFailed(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const reason = String(formData.get("reason") ?? "").trim() || null;

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("backup_snapshots")
    .select("*")
    .eq("id", id)
    .maybeSingle<BackupSnapshotRow>();
  if (!before) throw new Error("not found");

  const update = {
    status: "failed" as BackupSnapshotRow["status"],
    finished_at: new Date().toISOString(),
    metadata: {
      ...(before.metadata ?? {}),
      failure_reason: reason ?? "(unspecified)",
    },
  };

  const { error } = await admin
    .from("backup_snapshots")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "backup.mark_failed",
    targetType: "backup_snapshot",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/backups");
}
