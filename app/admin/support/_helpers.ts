import "server-only";

import type {
  SupportTicketPriority,
  SupportTicketStatus,
} from "../_types";

/**
 * Constants + pure helpers for /admin/support. Lives outside the
 * `_actions.ts` "use server" module because that file may only export
 * async functions.
 */

export const TICKET_STATUSES: ReadonlyArray<SupportTicketStatus> = [
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
];

export const TICKET_PRIORITIES: ReadonlyArray<SupportTicketPriority> = [
  "low",
  "normal",
  "high",
  "urgent",
];

export function parseStatus(raw: unknown): SupportTicketStatus {
  const s = String(raw ?? "").trim();
  return (TICKET_STATUSES as ReadonlyArray<string>).includes(s)
    ? (s as SupportTicketStatus)
    : "open";
}

export function parsePriority(raw: unknown): SupportTicketPriority {
  const s = String(raw ?? "").trim();
  return (TICKET_PRIORITIES as ReadonlyArray<string>).includes(s)
    ? (s as SupportTicketPriority)
    : "normal";
}

export const STATUS_CHIP: Record<SupportTicketStatus, string> = {
  open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  waiting_user: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  resolved: "bg-app-elevated text-secondary border border-app",
  closed: "bg-app-elevated text-faint border border-app",
};

export const PRIORITY_CHIP: Record<SupportTicketPriority, string> = {
  low: "bg-app-elevated text-faint border border-app",
  normal: "bg-app-elevated text-secondary border border-app",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  urgent: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

/**
 * Order tickets the way the inbox should: open first → in_progress →
 * waiting_user → resolved → closed. We map status to an integer so a
 * simple .order() over Postgres can't do it directly; use a SELECT-side
 * sort or do it in JS after pulling rows.
 */
export const STATUS_RANK: Record<SupportTicketStatus, number> = {
  open: 0,
  in_progress: 1,
  waiting_user: 2,
  resolved: 3,
  closed: 4,
};

export const PRIORITY_RANK: Record<SupportTicketPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};
