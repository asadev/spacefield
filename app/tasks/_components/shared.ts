import type { TaskPriority } from "@/lib/tasks/types";

/**
 * Shared visual tokens for the tasks pages. Tailwind classes only —
 * keep this file pure (no React imports) so server components and
 * client islands can share it.
 */

export const PRIORITY_PILL_CLASS: Record<TaskPriority, string> = {
  urgent:
    "bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
  normal: "bg-app-elevated text-secondary border border-app",
  low: "bg-app-elevated text-muted border border-app",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export function dueClassname(
  due_at: string | null,
  completed_at: string | null
): string {
  if (!due_at) return "text-faint";
  if (completed_at) return "text-faint line-through";
  const due = new Date(due_at).getTime();
  if (Number.isNaN(due)) return "text-faint";
  const now = Date.now();
  if (due < now) return "text-rose-500 dark:text-rose-400";
  if (due - now < 24 * 60 * 60 * 1000)
    return "text-amber-600 dark:text-amber-400";
  return "text-secondary";
}

export function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16);
}
