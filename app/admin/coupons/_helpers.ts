/**
 * UI helpers for `/admin/coupons`. No "use server" — synchronous, can be
 * imported into RSC pages directly.
 */

import type { CouponKind } from "../_types";

export const COUPON_KIND_LABELS: Record<CouponKind, string> = {
  percent: "Percent off",
  fixed: "Fixed amount",
  tier_upgrade: "Tier upgrade",
  free_months: "Free months",
};

export function couponKindChipClass(kind: CouponKind): string {
  switch (kind) {
    case "percent":
      return "bg-tool-accent-soft text-tool-accent";
    case "fixed":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "tier_upgrade":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "free_months":
      return "bg-violet-500/15 text-violet-600 dark:text-violet-400";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

/**
 * Format a coupon's `value` field according to its kind.
 *   percent       → "20%"
 *   fixed         → "$20.00"  (treat numeric value as dollars)
 *   tier_upgrade  → "→ tier"  (no numeric — value column unused)
 *   free_months   → "N month(s)"
 */
export function formatCouponValue(kind: CouponKind, value: number): string {
  if (kind === "percent") return `${Math.round(value)}%`;
  if (kind === "fixed") return `$${value.toFixed(2)}`;
  if (kind === "tier_upgrade") return "→ upgrade";
  if (kind === "free_months") {
    const n = Math.round(value);
    return `${n} month${n === 1 ? "" : "s"}`;
  }
  return String(value);
}

/**
 * Compute the coupon schedule chip — uses both starts_at/ends_at and
 * enabled to decide what to show.
 */
export type CouponSchedule =
  | { tone: "live"; label: string }
  | { tone: "scheduled"; label: string }
  | { tone: "expired"; label: string }
  | { tone: "off"; label: string };

export function couponSchedule(
  enabled: boolean,
  startsAt: string | null,
  endsAt: string | null
): CouponSchedule {
  if (!enabled) return { tone: "off", label: "Disabled" };
  const now = Date.now();
  const start = startsAt ? new Date(startsAt).getTime() : null;
  const end = endsAt ? new Date(endsAt).getTime() : null;
  if (start && start > now) {
    return { tone: "scheduled", label: `Starts ${startsAt!.slice(0, 10)}` };
  }
  if (end && end < now) {
    return { tone: "expired", label: `Ended ${endsAt!.slice(0, 10)}` };
  }
  if (end) return { tone: "live", label: `Ends ${endsAt!.slice(0, 10)}` };
  return { tone: "live", label: "Live" };
}

export function couponScheduleChipClass(
  tone: CouponSchedule["tone"]
): string {
  switch (tone) {
    case "live":
      return "bg-emerald-500/15 text-emerald-500";
    case "scheduled":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "expired":
      return "bg-rose-500/15 text-rose-500";
    case "off":
      return "bg-app text-faint border border-app";
  }
}

/** datetime-local <input> needs `YYYY-MM-DDTHH:MM`. */
export function isoToInputLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // Strip seconds and trailing Z; keep the leading slice <input> can parse.
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
