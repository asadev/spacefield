/**
 * Shared helpers for /admin/analytics. Server-only (no "use client").
 */

import "server-only";

export type RangeKey = "7d" | "30d" | "90d" | "custom";

/** Parse `?range=` and `?since=` into a concrete since-ISO + the matching key. */
export function resolveSince(searchParams: {
  range?: string;
  since?: string;
}): { since: string; range: RangeKey } {
  const raw = (searchParams.range ?? "30d").toLowerCase();
  if (searchParams.since) {
    const t = Date.parse(searchParams.since);
    if (!Number.isNaN(t)) {
      return { since: new Date(t).toISOString(), range: "custom" };
    }
  }
  if (raw === "7d") {
    return { since: nDaysAgo(7), range: "7d" };
  }
  if (raw === "90d") {
    return { since: nDaysAgo(90), range: "90d" };
  }
  return { since: nDaysAgo(30), range: "30d" };
}

export function nDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/** Stable color/badge per toShare link type — used in the row chips. */
export function typeChipClass(type: string): string {
  switch (type) {
    case "form":
      return "bg-blue-500/15 text-blue-500";
    case "page":
      return "bg-emerald-500/15 text-emerald-500";
    case "quote":
      return "bg-amber-500/15 text-amber-500";
    case "booking":
      return "bg-purple-500/15 text-purple-500";
    case "redirect":
      return "bg-rose-500/15 text-rose-500";
    case "file":
      return "bg-sky-500/15 text-sky-500";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

/** Status chip for webhook delivery rows. */
export function webhookStatusChipClass(status: string): string {
  if (status === "success") return "bg-emerald-500/15 text-emerald-500";
  if (status === "non_2xx" || status === "network_error" || status === "timeout") {
    return "bg-rose-500/15 text-rose-500";
  }
  if (status === "signing_skipped") return "bg-amber-500/15 text-amber-500";
  return "bg-app-elevated text-secondary border border-app";
}

/** "12,345 (3.4%)" — for stat sub-text. */
export function formatPercent(n: number, total: number): string {
  if (!total) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

/** Truncate ip_hash and similar opaque tokens. */
export function truncateMiddle(s: string | null | undefined, keep = 6): string {
  if (!s) return "—";
  if (s.length <= keep * 2 + 1) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}
