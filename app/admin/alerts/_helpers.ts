import type { AlertConditionType } from "../_types";

/**
 * Per-condition-type config for the alert editor. Lives in a sibling
 * file (not `_actions.ts`) because `"use server"` modules can only
 * export async functions — these are constants and pure types.
 */

export const CONDITION_TYPES: AlertConditionType[] = [
  "signup_drop",
  "webhook_failures",
  "error_rate",
  "cron_missed",
  "low_credit",
  "custom_query",
  "agent_failures",
  "storage_pct",
];

export const CONDITION_LABELS: Record<AlertConditionType, string> = {
  signup_drop: "Sign-up drop",
  webhook_failures: "Webhook failures",
  error_rate: "Error rate",
  cron_missed: "Cron missed",
  low_credit: "Low credit",
  custom_query: "Custom SQL",
  agent_failures: "Agent failures",
  storage_pct: "Storage percent",
};

export interface ConditionField {
  key: string;
  label: string;
  hint?: string;
  type: "number" | "text" | "textarea";
  placeholder?: string;
  defaultValue?: string;
}

/**
 * Per-condition editable fields. Renders into the conditional
 * <ConditionParams /> UI block. The values come back as
 * `condition_params[<key>]` form fields and the action assembles them
 * into the `condition_params` JSONB column.
 */
export const CONDITION_FIELDS: Record<AlertConditionType, ConditionField[]> = {
  signup_drop: [
    {
      key: "threshold_percent",
      label: "Drop threshold (%)",
      hint: "Trigger when sign-ups in window are this much below the prior window.",
      type: "number",
      defaultValue: "30",
    },
    {
      key: "window_hours",
      label: "Window (hours)",
      hint: "Compares the most recent N hours to the previous N hours.",
      type: "number",
      defaultValue: "24",
    },
  ],
  webhook_failures: [
    {
      key: "failure_count",
      label: "Failure count",
      hint: "Trigger when this many failures occur within the window.",
      type: "number",
      defaultValue: "5",
    },
    {
      key: "window_hours",
      label: "Window (hours)",
      type: "number",
      defaultValue: "1",
    },
  ],
  error_rate: [
    {
      key: "rate_percent",
      label: "Error rate threshold (%)",
      type: "number",
      defaultValue: "5",
    },
    {
      key: "window_minutes",
      label: "Window (minutes)",
      type: "number",
      defaultValue: "15",
    },
    {
      key: "min_volume",
      label: "Minimum volume",
      hint: "Don't trigger unless at least this many events occurred.",
      type: "number",
      defaultValue: "20",
    },
  ],
  cron_missed: [
    {
      key: "job_id",
      label: "Cron job id",
      hint: "Matches a row in cron_jobs.id (e.g. social-publish).",
      type: "text",
      placeholder: "social-publish",
    },
    {
      key: "max_minutes_late",
      label: "Max minutes late",
      type: "number",
      defaultValue: "15",
    },
  ],
  low_credit: [
    {
      key: "remaining_pct",
      label: "Remaining credits (%)",
      hint: "Trigger when a workspace's monthly credit balance falls below this percent.",
      type: "number",
      defaultValue: "10",
    },
  ],
  custom_query: [
    {
      key: "sql",
      label: "SQL query",
      hint: "Must return a single row with a numeric `value`. Trigger when value > threshold.",
      type: "textarea",
      placeholder: "select count(*)::int as value from ...",
    },
    {
      key: "threshold",
      label: "Threshold",
      type: "number",
      defaultValue: "0",
    },
  ],
  agent_failures: [
    {
      key: "failure_count",
      label: "Failure count",
      type: "number",
      defaultValue: "10",
    },
    {
      key: "window_minutes",
      label: "Window (minutes)",
      type: "number",
      defaultValue: "30",
    },
  ],
  storage_pct: [
    {
      key: "threshold_pct",
      label: "Storage % threshold",
      hint: "Trigger when any workspace exceeds this share of its tier cap.",
      type: "number",
      defaultValue: "90",
    },
  ],
};

export const ACTION_CHANNELS = ["email", "telegram", "whatsapp"] as const;
export type ActionChannel = (typeof ACTION_CHANNELS)[number];
