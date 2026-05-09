import "server-only";

import type { IntegrationRow } from "../_types";

/**
 * Sync helpers for `/admin/integrations`. NOT a "use server" file.
 */

export const INTEGRATION_STATUSES: IntegrationRow["status"][] = [
  "available",
  "beta",
  "disabled",
  "deprecated",
];

export const STATUS_CHIP_CLASS: Record<
  IntegrationRow["status"],
  string
> = {
  available: "bg-emerald-500/15 text-emerald-500",
  beta: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  disabled: "bg-app-elevated text-faint border border-app",
  deprecated: "bg-rose-500/15 text-rose-500",
};

export type IntegrationFilters = {
  category?: string;
  status?: IntegrationRow["status"];
  search?: string;
};

export function parseStatus(
  raw: string | undefined
): IntegrationRow["status"] | null {
  if (!raw) return null;
  return (INTEGRATION_STATUSES as string[]).includes(raw)
    ? (raw as IntegrationRow["status"])
    : null;
}

/** Cast `required_env` jsonb into a typed string[]. */
export function readRequiredEnv(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v ?? "").trim())
    .filter((s) => s.length > 0);
}

/** First letter avatar fallback for integrations missing a logo. */
export function firstLetterAvatar(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

/**
 * Verify which env names are present in process.env. Returns a map id ⇒
 * present?. Server-only because process.env is not in the client.
 */
export function verifyEnvVars(names: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const n of names) {
    const v = process.env[n];
    out[n] = typeof v === "string" && v.length > 0;
  }
  return out;
}
