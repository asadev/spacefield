"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { DataExportRequestRow } from "../_types";

/**
 * Server actions for `/admin/data-exports`. Every action calls
 * `assertAdmin()` AND `recordAdminAction(...)`.
 *
 * The actual export pipeline (file generation + storage upload) is an
 * environmental follow-up. These actions move the row through the
 * status machine and stamp a placeholder `download_url` when ready —
 * enough for an operator to coordinate with the user.
 */

const VALID_KINDS: DataExportRequestRow["kind"][] = [
  "gdpr_export",
  "deletion",
  "workspace_export",
];

function parseKind(raw: unknown): DataExportRequestRow["kind"] {
  const s = String(raw ?? "").trim();
  return (VALID_KINDS as string[]).includes(s)
    ? (s as DataExportRequestRow["kind"])
    : "gdpr_export";
}

function expiryIso(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/* ─────────────── createRequest ─────────────── */

export async function createRequest(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const userId = String(formData.get("user_id") ?? "").trim() || null;
  const kind = parseKind(formData.get("kind"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const insertRow = {
    user_id: userId,
    kind,
    status: "pending" as DataExportRequestRow["status"],
    notes,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("data_export_requests")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");

  await recordAdminAction({
    action: "data_export.create",
    targetType: "data_export_request",
    targetId: (data as { id: string }).id,
    after: { id: (data as { id: string }).id, ...insertRow },
    metadata: { actor_user_id: auth.userId },
  });

  revalidatePath("/admin/data-exports");
  redirect(`/admin/data-exports/${(data as { id: string }).id}`);
}

/* ─────────────── updateRequest ─────────────── */

export async function updateRequest(formData: FormData): Promise<void> {
  await assertAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const userId = String(formData.get("user_id") ?? "").trim() || null;
  const kind = parseKind(formData.get("kind"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("data_export_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<DataExportRequestRow>();

  const update = {
    user_id: userId,
    kind,
    notes,
  };

  const { error } = await admin
    .from("data_export_requests")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "data_export.update",
    targetType: "data_export_request",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/data-exports");
  revalidatePath(`/admin/data-exports/${id}`);
}

/* ─────────────── runRequest ─────────────── */

/**
 * Move a request to status='running'. The actual export job is
 * environmental — this is the audited admin signal that "we kicked
 * off the export." `markReady` is the matching transition once the
 * export is uploaded.
 */
export async function runRequest(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("data_export_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<DataExportRequestRow>();
  if (!before) throw new Error("not found");

  // Idempotent: only transition pending → running.
  if (before.status !== "pending") {
    throw new Error(`cannot run from status='${before.status}'`);
  }

  const update = {
    status: "running" as DataExportRequestRow["status"],
  };

  const { error } = await admin
    .from("data_export_requests")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "data_export.run",
    targetType: "data_export_request",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/data-exports");
  revalidatePath(`/admin/data-exports/${id}`);
}

/* ─────────────── markReady ─────────────── */

export async function markReady(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const downloadUrlRaw = String(formData.get("download_url") ?? "").trim();
  const days = Number(formData.get("expiry_days"));
  const expiryDays = Number.isFinite(days) && days > 0 ? Math.min(90, days) : 14;

  // Mock URL when no real one provided yet — keeps the row legible.
  const downloadUrl =
    downloadUrlRaw || `https://exports.spacefield.local/${id}.zip`;

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("data_export_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<DataExportRequestRow>();
  if (!before) throw new Error("not found");

  const update = {
    status: "ready" as DataExportRequestRow["status"],
    download_url: downloadUrl,
    expires_at: expiryIso(expiryDays),
    finished_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("data_export_requests")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "data_export.mark_ready",
    targetType: "data_export_request",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/data-exports");
  revalidatePath(`/admin/data-exports/${id}`);
}

/* ─────────────── markFailed ─────────────── */

export async function markFailed(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("data_export_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<DataExportRequestRow>();
  if (!before) throw new Error("not found");

  const update = {
    status: "failed" as DataExportRequestRow["status"],
    finished_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("data_export_requests")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "data_export.mark_failed",
    targetType: "data_export_request",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/data-exports");
  revalidatePath(`/admin/data-exports/${id}`);
}

/* ─────────────── approveDeletion ─────────────── */

/**
 * For kind='deletion' rows. Moves status pending → running and
 * stamps an approval marker in metadata-equivalent (notes prefixed).
 * The actual user-deletion job is environmental.
 */
export async function approveDeletion(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("data_export_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<DataExportRequestRow>();
  if (!before) throw new Error("not found");
  if (before.kind !== "deletion") {
    throw new Error("approveDeletion only valid for kind='deletion'");
  }
  if (before.status !== "pending") {
    throw new Error(`cannot approve from status='${before.status}'`);
  }

  const stamp = `[approved by ${auth.email ?? auth.userId} at ${new Date().toISOString()}]`;
  const newNotes = before.notes ? `${stamp}\n${before.notes}` : stamp;

  const update = {
    status: "running" as DataExportRequestRow["status"],
    notes: newNotes,
  };

  const { error } = await admin
    .from("data_export_requests")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "data_export.approve_deletion",
    targetType: "data_export_request",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/data-exports");
  revalidatePath(`/admin/data-exports/${id}`);
}

/* ─────────────── deleteRequest ─────────────── */

export async function deleteRequest(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("data_export_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<DataExportRequestRow>();

  const { error } = await admin
    .from("data_export_requests")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "data_export.delete",
    targetType: "data_export_request",
    targetId: id,
    before,
  });

  revalidatePath("/admin/data-exports");
  redirect("/admin/data-exports");
}
