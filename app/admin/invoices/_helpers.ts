import type { InvoiceStatus } from "../_types";

import { formatMoneyCents } from "../refunds/_helpers";

export { formatMoneyCents };

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "draft",
  "sent",
  "paid",
  "overdue",
  "void",
  "refunded",
];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  refunded: "Refunded",
};

export function invoiceStatusChipClass(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "bg-app text-faint border border-app";
    case "sent":
      return "bg-sky-500/15 text-sky-500 dark:text-sky-400";
    case "paid":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "overdue":
      return "bg-rose-500/15 text-rose-500";
    case "void":
      return "bg-app-elevated text-secondary border border-app";
    case "refunded":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    default:
      return "bg-app text-faint border border-app";
  }
}

export function isInvoiceStatus(v: string | null | undefined): v is InvoiceStatus {
  return (
    v === "draft" ||
    v === "sent" ||
    v === "paid" ||
    v === "overdue" ||
    v === "void" ||
    v === "refunded"
  );
}

export interface ParsedLineItem {
  description: string;
  quantity: number;
  unit_amount_cents: number;
}

/**
 * Parse a JSON-textarea body into an array of validated line items.
 * Each item must have `description` (string), `quantity` (number),
 * `unit_amount_cents` (integer cents).
 */
export function parseLineItems(raw: string): ParsedLineItem[] {
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

/**
 * Recompute subtotal/tax/total from line items + a tax rate.
 * `tax_rate` is a decimal — 0.05 = 5%. Returns whole cents (rounded).
 */
export function computeTotals(
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

export function isOverdue(
  due_date: string | null | undefined,
  status: InvoiceStatus
): boolean {
  if (!due_date) return false;
  if (status === "paid" || status === "void" || status === "refunded") return false;
  const d = new Date(due_date);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}
