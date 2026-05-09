import type {
  ModerationAction,
  ModerationApplyTo,
  ModerationRuleRow,
} from "../_types";

/**
 * Per-rule-kind / action / applies-to config for the moderation editor.
 * Lives in a sibling file (not `_actions.ts`) because `"use server"`
 * modules can only export async functions — these are constants and
 * pure types.
 */

export type ModerationRuleKind = ModerationRuleRow["rule_kind"];

export const RULE_KINDS: ModerationRuleKind[] = [
  "banned_word",
  "regex",
  "threshold",
  "length",
];

export const RULE_KIND_LABELS: Record<ModerationRuleKind, string> = {
  banned_word: "Banned word",
  regex: "Regex",
  threshold: "Threshold",
  length: "Length",
};

export const RULE_KIND_HINTS: Record<ModerationRuleKind, string> = {
  banned_word:
    "Plain substring match (case-insensitive). Pattern is the literal word/phrase to flag.",
  regex:
    "JavaScript regex. Pattern is fed straight to `new RegExp(pattern, 'i')`.",
  threshold:
    "Numeric threshold rule — pattern is a JSON config like {\"field\":\"toxicity\",\"min\":0.8}.",
  length:
    "Length cap — pattern is a positive integer (max characters allowed).",
};

export const RULE_KIND_CHIP_COLORS: Record<ModerationRuleKind, string> = {
  banned_word: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  regex: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  threshold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  length: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

export const ACTIONS: ModerationAction[] = ["block", "flag", "review"];

export const ACTION_LABELS: Record<ModerationAction, string> = {
  block: "Block",
  flag: "Flag",
  review: "Send to review",
};

export const ACTION_CHIP_COLORS: Record<ModerationAction, string> = {
  block: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  flag: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  review: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

export const APPLIES_TO: ModerationApplyTo[] = [
  "any",
  "chat",
  "crm",
  "social",
  "share",
];

export const APPLIES_TO_LABELS: Record<ModerationApplyTo, string> = {
  any: "Any source",
  chat: "Agent chat",
  crm: "CRM (forms / notes)",
  social: "Social posts",
  share: "Share links",
};

export const APPLIES_TO_CHIP_COLORS: Record<ModerationApplyTo, string> = {
  any: "bg-app-elevated text-secondary border border-app",
  chat: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  crm: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  social: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  share: "bg-emerald-500/15 text-emerald-500",
};

export type QueueStatus = "pending" | "approved" | "rejected" | "escalated";

export const QUEUE_STATUSES: QueueStatus[] = [
  "pending",
  "approved",
  "rejected",
  "escalated",
];

export const QUEUE_STATUS_CHIP_COLORS: Record<QueueStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-500",
  rejected: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  escalated: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

/** Render a 1-5 severity as ★ icons (filled) + ☆ icons (empty). */
export function severityStars(severity: number): string {
  const sev = Math.min(5, Math.max(1, Math.round(severity)));
  return "★".repeat(sev) + "☆".repeat(5 - sev);
}

export function severityToneClass(severity: number): string {
  if (severity >= 5) return "text-rose-500";
  if (severity >= 4) return "text-rose-500/80";
  if (severity >= 3) return "text-amber-500";
  if (severity >= 2) return "text-amber-500/80";
  return "text-secondary";
}
