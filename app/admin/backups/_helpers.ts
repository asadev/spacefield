import type { BackupSnapshotRow } from "../_types";

export type BackupKind = BackupSnapshotRow["kind"];
export type BackupScope = BackupSnapshotRow["scope"];
export type BackupStatus = BackupSnapshotRow["status"];

export const BACKUP_KINDS: BackupKind[] = [
  "manual",
  "scheduled",
  "pre_migration",
];

export const BACKUP_KIND_LABELS: Record<BackupKind, string> = {
  manual: "Manual",
  scheduled: "Scheduled",
  pre_migration: "Pre-migration",
};

export const BACKUP_KIND_CHIP_COLORS: Record<BackupKind, string> = {
  manual: "bg-tool-accent-soft text-tool-accent",
  scheduled: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  pre_migration: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export const BACKUP_SCOPES: BackupScope[] = ["full", "workspace", "table"];

export const BACKUP_SCOPE_CHIP_COLORS: Record<BackupScope, string> = {
  full: "bg-emerald-500/15 text-emerald-500",
  workspace: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  table: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};

export const BACKUP_STATUSES: BackupStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "restored",
];

export const BACKUP_STATUS_CHIP_COLORS: Record<BackupStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-500",
  failed: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  restored: "bg-tool-accent-soft text-tool-accent",
};

export function durationLabel(
  startedAt: string,
  finishedAt: string | null
): string {
  if (!finishedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "—";
  }
  const ms = end - start;
  if (ms < 1000) return `${ms} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return remS ? `${m}m ${remS}s` : `${m}m`;
}
