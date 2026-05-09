import type { DataExportRequestRow } from "../_types";

export type DataExportKind = DataExportRequestRow["kind"];
export type DataExportStatus = DataExportRequestRow["status"];

export const EXPORT_KINDS: DataExportKind[] = [
  "gdpr_export",
  "deletion",
  "workspace_export",
];

export const EXPORT_KIND_LABELS: Record<DataExportKind, string> = {
  gdpr_export: "GDPR export",
  deletion: "Account deletion",
  workspace_export: "Workspace export",
};

export const EXPORT_KIND_HINTS: Record<DataExportKind, string> = {
  gdpr_export:
    "User-requested copy of every personal datum we hold (profile, workspaces, files, CRM, agent runs).",
  deletion:
    "User-requested deletion. Approval required before the deletion job runs.",
  workspace_export:
    "Export everything inside a single workspace (files, CRM, boards, settings).",
};

export const EXPORT_KIND_CHIP_COLORS: Record<DataExportKind, string> = {
  gdpr_export: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  deletion: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  workspace_export:
    "bg-tool-accent-soft text-tool-accent",
};

export const EXPORT_STATUSES: DataExportStatus[] = [
  "pending",
  "running",
  "ready",
  "expired",
  "failed",
];

export const EXPORT_STATUS_CHIP_COLORS: Record<DataExportStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  ready: "bg-emerald-500/15 text-emerald-500",
  expired: "bg-app-elevated text-secondary border border-app",
  failed: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

/** Default expiry window for ready exports (14 days). */
export const DEFAULT_EXPIRY_DAYS = 14;
