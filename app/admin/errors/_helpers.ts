import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { ErrorEventRow, ErrorLevel } from "../_types";

/**
 * Helpers shared across the errors index, group, and detail views. NOT
 * a "use server" file — exports types & sync utilities. Server actions
 * live in `_actions.ts`.
 */

export const ERROR_LEVELS: ErrorLevel[] = [
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
];

export const LEVEL_CHIP_CLASS: Record<ErrorLevel, string> = {
  debug: "bg-app-elevated text-faint border border-app",
  info: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  error: "bg-rose-500/15 text-rose-500",
  fatal: "bg-rose-600/25 text-rose-600 dark:text-rose-400 font-semibold",
};

export type ErrorFilters = {
  level?: ErrorLevel;
  source?: string;
  fingerprint?: string;
  user?: string;
  resolved?: "all" | "yes" | "no";
  from?: string;
  to?: string;
  groupBy?: "none" | "fingerprint";
};

export function parseLevel(raw: string | undefined): ErrorLevel | null {
  if (!raw) return null;
  return (ERROR_LEVELS as string[]).includes(raw) ? (raw as ErrorLevel) : null;
}

export function parseResolved(
  raw: string | undefined
): "all" | "yes" | "no" {
  if (raw === "yes" || raw === "no") return raw;
  return "all";
}

/**
 * Normalize an ISO date input (`from` / `to`). Accepts `YYYY-MM-DD` or
 * full ISO; returns the canonical timestamp string Supabase expects, or
 * null if invalid/empty.
 */
export function parseDateBoundary(
  raw: string | undefined,
  endOfDay: boolean
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Date-only input → expand to start/end of day UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    return `${trimmed}${suffix}`;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type ErrorFingerprintGroup = {
  fingerprint: string;
  level: ErrorLevel;
  source: string | null;
  message: string;
  count: number;
  first_seen: string;
  last_seen: string;
  resolved_count: number;
};

/**
 * Aggregate error_events by fingerprint client-side. Pulls the latest
 * 1000 rows under filters, groups in memory, sorts by count desc.
 */
export async function fetchErrorGroups(filters: ErrorFilters): Promise<{
  groups: ErrorFingerprintGroup[];
  totalRows: number;
}> {
  const admin = createAdminClient();
  let query = admin
    .from("error_events")
    .select(
      "id, occurred_at, level, source, message, fingerprint, resolved_at",
      { count: "exact" }
    )
    .order("occurred_at", { ascending: false })
    .limit(1000);

  if (filters.level) query = query.eq("level", filters.level);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.fingerprint) {
    query = query.ilike("fingerprint", `%${filters.fingerprint}%`);
  }
  if (filters.user) query = query.eq("user_id", filters.user);
  if (filters.resolved === "yes") query = query.not("resolved_at", "is", null);
  else if (filters.resolved === "no") query = query.is("resolved_at", null);
  const fromTs = parseDateBoundary(filters.from, false);
  const toTs = parseDateBoundary(filters.to, true);
  if (fromTs) query = query.gte("occurred_at", fromTs);
  if (toTs) query = query.lte("occurred_at", toTs);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const groupsMap = new Map<string, ErrorFingerprintGroup>();
  for (const r of (data ?? []) as Array<
    Pick<
      ErrorEventRow,
      | "occurred_at"
      | "level"
      | "source"
      | "message"
      | "fingerprint"
      | "resolved_at"
    >
  >) {
    // Rows without a fingerprint are still groupable, by message hash.
    const key = r.fingerprint ?? `__msg__:${r.message.slice(0, 80)}`;
    const existing = groupsMap.get(key);
    if (!existing) {
      groupsMap.set(key, {
        fingerprint: key,
        level: r.level,
        source: r.source,
        message: r.message,
        count: 1,
        first_seen: r.occurred_at,
        last_seen: r.occurred_at,
        resolved_count: r.resolved_at ? 1 : 0,
      });
      continue;
    }
    existing.count += 1;
    if (r.occurred_at < existing.first_seen) existing.first_seen = r.occurred_at;
    if (r.occurred_at > existing.last_seen) existing.last_seen = r.occurred_at;
    if (r.resolved_at) existing.resolved_count += 1;
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) => b.count - a.count);
  return { groups, totalRows: count ?? data?.length ?? 0 };
}
