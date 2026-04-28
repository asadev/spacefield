/* ─────────────────────────────────────────────────────────────────────────
 * Kanban — pure helpers shared by PipelineView, DealsListView, DealDetail.
 * No React. Keeps formatting + position math testable + reusable.
 * ───────────────────────────────────────────────────────────────────── */

import type { CrmDeal, CrmPipelineStage } from "../../types";

/** Group deals by stage_id, preserving each stage's `position` ordering. */
export function bucketDeals(
  deals: CrmDeal[],
  stages: CrmPipelineStage[]
): Map<string, CrmDeal[]> {
  const byStage = new Map<string, CrmDeal[]>();
  for (const s of stages) byStage.set(s.id, []);
  for (const d of deals) {
    const arr = byStage.get(d.stage_id);
    if (arr) arr.push(d);
  }
  for (const [, arr] of byStage) {
    arr.sort((a, b) => {
      if (a.position === b.position) {
        return a.created_at < b.created_at ? 1 : -1;
      }
      return a.position - b.position;
    });
  }
  return byStage;
}

/** Calculate the next position when inserting before/after another card. */
export function positionForInsert(
  bucket: CrmDeal[],
  insertIndex: number
): number {
  if (bucket.length === 0) return 1000;
  if (insertIndex <= 0) {
    return bucket[0].position - 1000;
  }
  if (insertIndex >= bucket.length) {
    return bucket[bucket.length - 1].position + 1000;
  }
  const before = bucket[insertIndex - 1].position;
  const after = bucket[insertIndex].position;
  if (after - before <= 1) return before + 1; // tight pack — caller may renormalize later
  return Math.floor((before + after) / 2);
}

/** Sum of amounts across a list of deals, ignoring nulls. */
export function sumAmount(deals: CrmDeal[]): number {
  let total = 0;
  for (const d of deals) {
    if (typeof d.amount === "number" && !Number.isNaN(d.amount)) {
      total += d.amount;
    }
  }
  return total;
}

/** Compact currency total (e.g. "$12.4k", "$1.2M"). */
export function formatCompactCurrency(
  amount: number,
  currency = "USD"
): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 1,
      notation: amount >= 10_000 ? "compact" : "standard",
    }).format(amount);
  } catch {
    return `${code} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}

/** Days between two ISO dates (utc-naive). Negative = first is after second. */
export function daysBetween(a: string, b: string): number {
  const ad = new Date(a).getTime();
  const bd = new Date(b).getTime();
  return Math.floor((bd - ad) / (24 * 60 * 60 * 1000));
}

/** Phrase like "in 5d" / "2d overdue" / "today". */
export function formatCloseDate(closeDate: string | null): string {
  if (!closeDate) return "no close date";
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const days = daysBetween(todayStr, closeDate);
  if (days === 0) return "closes today";
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d overdue`;
}

/** True if the deal has been sitting in its current stage longer than rot_days. */
export function isRotting(
  deal: CrmDeal,
  stage: CrmPipelineStage | undefined
): boolean {
  if (!stage || !stage.rot_days || stage.rot_days <= 0) return false;
  if (stage.kind !== "open") return false;
  const ageDays = daysBetween(deal.updated_at.slice(0, 10), new Date().toISOString().slice(0, 10));
  return ageDays >= stage.rot_days;
}

/** Pretty currency for a deal card. */
export function formatDealAmount(
  amount: number | null,
  currency: string
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "—";
  }
  return formatCompactCurrency(amount, currency);
}
