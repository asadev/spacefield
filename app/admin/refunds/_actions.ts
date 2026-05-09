"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { RefundRow } from "../_types";

/**
 * Server actions for `/admin/refunds`. Every action calls
 * `assertAdmin()` AND `recordAdminAction(...)`.
 *
 * Audit-action naming: refund.create, refund.update, refund.approve,
 * refund.markProcessed, refund.reject, refund.markFailed.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CURRENCY_REGEX = /^[A-Z]{3}$/;

function parseAmountCents(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("amount_cents must be a non-negative integer");
  }
  return Math.trunc(n);
}

function parseCurrency(raw: unknown): string {
  const s = String(raw ?? "USD").trim().toUpperCase();
  if (!CURRENCY_REGEX.test(s)) {
    throw new Error("currency must be a 3-letter ISO code (e.g. USD, EUR)");
  }
  return s;
}

function parseUuid(raw: unknown, field: string, optional = false): string | null {
  const s = String(raw ?? "").trim();
  if (!s) {
    if (optional) return null;
    throw new Error(`${field} is required`);
  }
  if (!UUID_REGEX.test(s)) {
    throw new Error(`${field} is not a valid UUID`);
  }
  return s;
}

async function fetchRefund(id: string): Promise<RefundRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("refunds")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as RefundRow | null) ?? null;
}

/* ─────────────────────── createRefund ─────────────────────── */

export async function createRefund(formData: FormData): Promise<void> {
  await assertAdmin();

  const user_id = parseUuid(formData.get("user_id"), "user_id");
  const workspace_id = parseUuid(formData.get("workspace_id"), "workspace_id", true);
  const amount_cents = parseAmountCents(formData.get("amount_cents"));
  const currency = parseCurrency(formData.get("currency"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const external_payment_id =
    String(formData.get("external_payment_id") ?? "").trim() || null;

  const insertRow = {
    user_id,
    workspace_id,
    amount_cents,
    currency,
    reason,
    notes,
    external_payment_id,
    status: "pending" as const,
    metadata: {},
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("refunds")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const newId = (data as { id: string }).id;

  await recordAdminAction({
    action: "refund.create",
    targetType: "refunds",
    targetId: newId,
    after: insertRow,
  });

  revalidatePath("/admin/refunds");
  redirect(`/admin/refunds/${newId}`);
}

/* ─────────────────────── updateRefund ─────────────────────── */

export async function updateRefund(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");

  const before = await fetchRefund(id);
  if (!before) throw new Error("refund not found");

  const reason = String(formData.get("reason") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const external_payment_id =
    String(formData.get("external_payment_id") ?? "").trim() || null;

  const update = {
    reason,
    notes,
    external_payment_id,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("refunds").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "refund.update",
    targetType: "refunds",
    targetId: id,
    before: {
      reason: before.reason,
      notes: before.notes,
      external_payment_id: before.external_payment_id,
    },
    after: update,
  });

  revalidatePath("/admin/refunds");
  revalidatePath(`/admin/refunds/${id}`);
}

/* ─────────────────────── approveRefund ─────────────────────── */

export async function approveRefund(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");

  const before = await fetchRefund(id);
  if (!before) throw new Error("refund not found");
  if (before.status !== "pending") {
    throw new Error(`cannot approve from status '${before.status}'`);
  }

  const update = {
    status: "approved" as const,
    approved_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("refunds").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "refund.approve",
    targetType: "refunds",
    targetId: id,
    before: { status: before.status, approved_by: before.approved_by },
    after: update,
  });

  revalidatePath("/admin/refunds");
  revalidatePath(`/admin/refunds/${id}`);
}

/* ─────────────────────── markProcessed ─────────────────────── */

export async function markProcessed(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");

  const before = await fetchRefund(id);
  if (!before) throw new Error("refund not found");
  if (before.status !== "approved") {
    throw new Error(
      `cannot mark processed from status '${before.status}' — must be approved first`
    );
  }
  const external_refund_id =
    String(formData.get("external_refund_id") ?? "").trim() || null;
  if (!external_refund_id) {
    throw new Error("external_refund_id is required when marking processed");
  }

  const update = {
    status: "processed" as const,
    processed_at: new Date().toISOString(),
    external_refund_id,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("refunds").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "refund.markProcessed",
    targetType: "refunds",
    targetId: id,
    before: {
      status: before.status,
      processed_at: before.processed_at,
      external_refund_id: before.external_refund_id,
    },
    after: update,
  });

  revalidatePath("/admin/refunds");
  revalidatePath(`/admin/refunds/${id}`);
}

/* ─────────────────────── rejectRefund ─────────────────────── */

export async function rejectRefund(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");

  const before = await fetchRefund(id);
  if (!before) throw new Error("refund not found");
  if (before.status === "processed") {
    throw new Error("cannot reject a processed refund");
  }

  const notes = String(formData.get("notes") ?? "").trim();
  if (!notes) throw new Error("notes is required when rejecting");

  const update = {
    status: "rejected" as const,
    notes,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("refunds").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "refund.reject",
    targetType: "refunds",
    targetId: id,
    before: { status: before.status, notes: before.notes },
    after: update,
  });

  revalidatePath("/admin/refunds");
  revalidatePath(`/admin/refunds/${id}`);
}

/* ─────────────────────── markFailed ─────────────────────── */

export async function markFailed(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");

  const before = await fetchRefund(id);
  if (!before) throw new Error("refund not found");
  if (before.status === "processed" || before.status === "rejected") {
    throw new Error(`cannot mark failed from status '${before.status}'`);
  }

  const noteRaw = String(formData.get("notes") ?? "").trim();
  const notes = noteRaw || before.notes;

  const update = {
    status: "failed" as const,
    notes,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("refunds").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "refund.markFailed",
    targetType: "refunds",
    targetId: id,
    before: { status: before.status, notes: before.notes },
    after: update,
  });

  revalidatePath("/admin/refunds");
  revalidatePath(`/admin/refunds/${id}`);
}
