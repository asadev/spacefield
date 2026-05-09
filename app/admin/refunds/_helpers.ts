import type { RefundStatus } from "../_types";

/**
 * Format a cents amount + ISO 4217 currency into a localized money
 * string. Uses `Intl.NumberFormat` so the symbol/decimals match the
 * currency (e.g. JPY → no decimals, USD → two decimals).
 */
export function formatMoneyCents(
  amountCents: number | null | undefined,
  currency: string | null | undefined
): string {
  const cents = Number(amountCents ?? 0);
  const code = (currency ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    // Fall back if currency is invalid — render as plain decimal.
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

export const REFUND_STATUSES: RefundStatus[] = [
  "pending",
  "approved",
  "processed",
  "rejected",
  "failed",
];

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  processed: "Processed",
  rejected: "Rejected",
  failed: "Failed",
};

export function refundStatusChipClass(status: RefundStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "approved":
      return "bg-sky-500/15 text-sky-500 dark:text-sky-400";
    case "processed":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "rejected":
      return "bg-rose-500/15 text-rose-500";
    case "failed":
      return "bg-rose-500/15 text-rose-500";
    default:
      return "bg-app text-faint border border-app";
  }
}

export function isRefundStatus(v: string | null | undefined): v is RefundStatus {
  return (
    v === "pending" ||
    v === "approved" ||
    v === "processed" ||
    v === "rejected" ||
    v === "failed"
  );
}

export function diffMs(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.max(0, tb - ta);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return "<1s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.round(totalMin / 60);
  if (totalHr < 24) return `${totalHr}h`;
  const days = Math.round(totalHr / 24);
  return `${days}d`;
}

export function excerpt(s: string | null | undefined, max = 80): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}
