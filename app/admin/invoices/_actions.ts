"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { InvoiceRow } from "../_types";

/**
 * Server actions for `/admin/invoices`. Every action calls
 * `assertAdmin()` AND `recordAdminAction(...)`.
 *
 * Audit-action naming: invoice.create, invoice.update, invoice.markPaid,
 * invoice.void, invoice.send.
 *
 * `"use server"` modules can only export async functions — keep
 * helper types/constants in `_helpers.ts`.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY_REGEX = /^[A-Z]{3}$/;

interface ParsedLineItem {
  description: string;
  quantity: number;
  unit_amount_cents: number;
}

function parseLineItemsLocal(raw: string): ParsedLineItem[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("line_items must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("line_items must be a JSON array");
  }
  const out: ParsedLineItem[] = [];
  parsed.forEach((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new Error(`line_items[${idx}] must be an object`);
    }
    const obj = item as Record<string, unknown>;
    const description = String(obj.description ?? "").trim();
    if (!description) {
      throw new Error(`line_items[${idx}].description is required`);
    }
    const quantity = Number(obj.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`line_items[${idx}].quantity must be > 0`);
    }
    const unit = Number(obj.unit_amount_cents ?? 0);
    if (!Number.isFinite(unit) || unit < 0) {
      throw new Error(
        `line_items[${idx}].unit_amount_cents must be a non-negative integer`
      );
    }
    out.push({
      description,
      quantity,
      unit_amount_cents: Math.trunc(unit),
    });
  });
  return out;
}

function computeTotalsLocal(
  items: ParsedLineItem[],
  taxRate = 0
): { subtotal_cents: number; tax_cents: number; total_cents: number } {
  const subtotal_cents = items.reduce(
    (acc, it) => acc + Math.round(it.quantity * it.unit_amount_cents),
    0
  );
  const tax_cents = Math.round(subtotal_cents * Math.max(0, taxRate));
  const total_cents = subtotal_cents + tax_cents;
  return { subtotal_cents, tax_cents, total_cents };
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

function parseCurrency(raw: unknown): string {
  const s = String(raw ?? "USD").trim().toUpperCase();
  if (!CURRENCY_REGEX.test(s)) {
    throw new Error("currency must be a 3-letter ISO code (e.g. USD, EUR)");
  }
  return s;
}

function parseDate(raw: unknown, optional = true): string | null {
  const s = String(raw ?? "").trim();
  if (!s) {
    if (optional) return null;
    throw new Error("date is required");
  }
  // Expect YYYY-MM-DD (HTML date input). Validate.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error("date is invalid");
  }
  return s.slice(0, 10);
}

function parseTaxRate(raw: unknown): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error("tax_rate must be a decimal between 0 and 1 (e.g. 0.05)");
  }
  return n;
}

async function fetchInvoice(id: string): Promise<InvoiceRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as InvoiceRow | null) ?? null;
}

/** Generate a unique invoice number — `INV-YYYYMM-XXXX`. */
function generateInvoiceNumber(): string {
  const now = new Date();
  const yy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `INV-${yy}${mm}-${rand}`;
}

/* ─────────────────────── createInvoice ─────────────────────── */

export async function createInvoice(formData: FormData): Promise<void> {
  await assertAdmin();

  const user_id = parseUuid(formData.get("user_id"), "user_id");
  const workspace_id = parseUuid(
    formData.get("workspace_id"),
    "workspace_id",
    true
  );
  const currency = parseCurrency(formData.get("currency"));
  const due_date = parseDate(formData.get("due_date"), true);
  const tax_rate = parseTaxRate(formData.get("tax_rate"));
  const line_items = parseLineItemsLocal(
    String(formData.get("line_items") ?? "")
  );

  const totals = computeTotalsLocal(line_items, tax_rate);
  const number = generateInvoiceNumber();

  const insertRow = {
    number,
    user_id,
    workspace_id,
    amount_cents: totals.total_cents,
    currency,
    status: "draft" as const,
    due_date,
    line_items,
    subtotal_cents: totals.subtotal_cents,
    tax_cents: totals.tax_cents,
    total_cents: totals.total_cents,
    metadata: tax_rate > 0 ? { tax_rate } : {},
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invoices")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const newId = (data as { id: string }).id;

  await recordAdminAction({
    action: "invoice.create",
    targetType: "invoices",
    targetId: newId,
    after: insertRow,
  });

  revalidatePath("/admin/invoices");
  redirect(`/admin/invoices/${newId}`);
}

/* ─────────────────────── updateInvoice ─────────────────────── */

export async function updateInvoice(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");
  const before = await fetchInvoice(id);
  if (!before) throw new Error("invoice not found");

  const due_date = parseDate(formData.get("due_date"), true);
  const tax_rate = parseTaxRate(formData.get("tax_rate"));
  const line_items = parseLineItemsLocal(
    String(formData.get("line_items") ?? "")
  );
  const pdf_url = String(formData.get("pdf_url") ?? "").trim() || null;
  const external_invoice_id =
    String(formData.get("external_invoice_id") ?? "").trim() || null;

  const totals = computeTotalsLocal(line_items, tax_rate);
  const beforeMeta = (before.metadata ?? {}) as Record<string, unknown>;
  const metadata: Record<string, unknown> = { ...beforeMeta };
  if (tax_rate > 0) metadata.tax_rate = tax_rate;
  else delete metadata.tax_rate;

  const update = {
    due_date,
    line_items,
    amount_cents: totals.total_cents,
    subtotal_cents: totals.subtotal_cents,
    tax_cents: totals.tax_cents,
    total_cents: totals.total_cents,
    pdf_url,
    external_invoice_id,
    metadata,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("invoices").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "invoice.update",
    targetType: "invoices",
    targetId: id,
    before: {
      due_date: before.due_date,
      line_items: before.line_items,
      total_cents: before.total_cents,
      subtotal_cents: before.subtotal_cents,
      tax_cents: before.tax_cents,
      pdf_url: before.pdf_url,
      external_invoice_id: before.external_invoice_id,
    },
    after: update,
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
}

/* ─────────────────────── markPaid ─────────────────────── */

export async function markPaid(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");
  const before = await fetchInvoice(id);
  if (!before) throw new Error("invoice not found");
  if (before.status === "paid") return;
  if (before.status === "void") {
    throw new Error("cannot mark void invoice as paid");
  }

  const update = {
    status: "paid" as const,
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("invoices").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "invoice.markPaid",
    targetType: "invoices",
    targetId: id,
    before: { status: before.status, paid_at: before.paid_at },
    after: update,
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
}

/* ─────────────────────── voidInvoice ─────────────────────── */

export async function voidInvoice(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");
  const before = await fetchInvoice(id);
  if (!before) throw new Error("invoice not found");
  if (before.status === "paid") {
    throw new Error("cannot void a paid invoice — issue a refund instead");
  }
  if (before.status === "void") return;

  const update = {
    status: "void" as const,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("invoices").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "invoice.void",
    targetType: "invoices",
    targetId: id,
    before: { status: before.status },
    after: update,
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
}

/* ─────────────────────── sendInvoice ─────────────────────── */

export async function sendInvoice(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = parseUuid(formData.get("id"), "id");
  if (!id) throw new Error("missing id");
  const before = await fetchInvoice(id);
  if (!before) throw new Error("invoice not found");
  if (before.status === "paid") {
    throw new Error("cannot resend a paid invoice");
  }
  if (before.status === "void") {
    throw new Error("cannot send a voided invoice");
  }

  // Real email send is environmental — here we just record the state
  // change. A separate mail worker can poll for status='sent' rows.
  const update = {
    status: "sent" as const,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("invoices").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "invoice.send",
    targetType: "invoices",
    targetId: id,
    before: { status: before.status },
    after: update,
    metadata: { record_only: true },
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
}
