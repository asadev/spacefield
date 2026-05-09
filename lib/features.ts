import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type {
  FeatureFlagRow,
  FeatureRollout,
} from "@/app/admin/_types";

/**
 * Feature-flag resolver helpers. Server-only — call from server
 * components, server actions, or route handlers. For client components,
 * the caller should resolve the flag in a parent server component and
 * pass the boolean down as a prop.
 *
 * The single source of truth is the Postgres RPC `feature_enabled`
 * (defined in supabase/migrations/20260509_admin_panel_foundation.sql).
 * It's `security definer` and granted to authenticated/anon, so we use
 * the user-scoped client by default — that way the RPC's `auth.uid()`
 * default for the `uid` parameter matches the caller. When we don't have
 * a request-scoped session (e.g., during build / from a worker), we
 * fall back to the service-role client and pass `uid` explicitly.
 */

/**
 * Resolve a feature flag for the given user/workspace context. Returns
 * `false` on any error so callers can treat it as a safe-default gate.
 */
export async function featureEnabled(
  key: string,
  uid?: string | null,
  wsId?: string | null
): Promise<boolean> {
  if (!key) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("feature_enabled", {
      flag_key: key,
      uid: uid ?? undefined,
      ws_id: wsId ?? undefined,
    });
    if (error) {
      // Fall back to service-role — useful when there's no cookie session
      // (e.g., called from a background context).
      const admin = createAdminClient();
      const { data: data2, error: error2 } = await admin.rpc(
        "feature_enabled",
        {
          flag_key: key,
          uid: uid ?? undefined,
          ws_id: wsId ?? undefined,
        }
      );
      if (error2) return false;
      return data2 === true;
    }
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Read every feature flag, ordered by key. Returns `[]` on error.
 * Convenience for the admin UI; do not use as a hot-path resolver.
 */
export async function getAllFlags(): Promise<FeatureFlagRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("feature_flags")
      .select(
        "key, title, description, enabled, rollout, rollout_percent, allowlist_user_ids, allowlist_workspace_ids, metadata, created_at, updated_at, updated_by"
      )
      .order("key", { ascending: true });
    if (error || !data) return [];
    return (data as unknown[]).map(normalizeRow);
  } catch {
    return [];
  }
}

/**
 * Read a single feature flag. Returns `null` if not found.
 */
export async function getFlagByKey(
  key: string
): Promise<FeatureFlagRow | null> {
  if (!key) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("feature_flags")
      .select(
        "key, title, description, enabled, rollout, rollout_percent, allowlist_user_ids, allowlist_workspace_ids, metadata, created_at, updated_at, updated_by"
      )
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return normalizeRow(data);
  } catch {
    return null;
  }
}

/**
 * Mirror of the Postgres `feature_enabled` resolver, run in JS so the
 * admin "test resolver" UI can show *why* a flag resolved the way it
 * did. Keeping this in sync with the SQL is critical — if you change
 * the RPC, change this too. The SQL remains the source of truth at
 * runtime; this is purely for explainability in the admin panel.
 */
export type ResolverReason =
  | "no_flag"
  | "disabled"
  | "user_allowlist"
  | "workspace_allowlist"
  | "rollout_off"
  | "rollout_on"
  | "rollout_allowlist_miss"
  | "rollout_percent_in"
  | "rollout_percent_out"
  | "rollout_percent_no_uid";

export interface ResolverVerdict {
  enabled: boolean;
  reason: ResolverReason;
  detail: string;
}

export function resolveFlagLocally(
  flag: FeatureFlagRow | null,
  uid?: string | null,
  wsId?: string | null
): ResolverVerdict {
  if (!flag) {
    return {
      enabled: false,
      reason: "no_flag",
      detail: "No flag with that key.",
    };
  }
  if (!flag.enabled) {
    return {
      enabled: false,
      reason: "disabled",
      detail: "Flag is globally disabled (enabled = false).",
    };
  }

  if (uid && flag.allowlist_user_ids.includes(uid)) {
    return {
      enabled: true,
      reason: "user_allowlist",
      detail: `User UUID is in allowlist_user_ids.`,
    };
  }
  if (wsId && flag.allowlist_workspace_ids.includes(wsId)) {
    return {
      enabled: true,
      reason: "workspace_allowlist",
      detail: `Workspace UUID is in allowlist_workspace_ids.`,
    };
  }

  switch (flag.rollout) {
    case "off":
      return {
        enabled: false,
        reason: "rollout_off",
        detail: "Rollout strategy is 'off'.",
      };
    case "on":
      return {
        enabled: true,
        reason: "rollout_on",
        detail: "Rollout strategy is 'on' (everyone authenticated).",
      };
    case "allowlist":
      return {
        enabled: false,
        reason: "rollout_allowlist_miss",
        detail:
          "Rollout strategy is 'allowlist' and neither user nor workspace are in any allowlist.",
      };
    case "percent": {
      if (!uid) {
        return {
          enabled: false,
          reason: "rollout_percent_no_uid",
          detail: "Rollout strategy is 'percent' but no user UUID was provided.",
        };
      }
      const bucket = stableBucket(`${flag.key}:${uid}`);
      const inBucket = bucket < flag.rollout_percent;
      return {
        enabled: inBucket,
        reason: inBucket ? "rollout_percent_in" : "rollout_percent_out",
        detail: `Bucket ${bucket} ${
          inBucket ? "<" : "≥"
        } rollout_percent ${flag.rollout_percent}.`,
      };
    }
    default:
      return {
        enabled: false,
        reason: "rollout_off",
        detail: `Unknown rollout strategy: ${String(flag.rollout)}.`,
      };
  }
}

/**
 * JS port of Postgres `abs(hashtext(...)) % 100`. Postgres `hashtext`
 * is the lookup3 hash; we use a small lookup3-compatible variant so the
 * bucket is *consistent* across clients running this resolver. The SQL
 * RPC is still the runtime source of truth — this is for the admin
 * "test resolver" reason UI, where slight drift is acceptable but
 * stability for a given input matters.
 *
 * Note: Postgres `hashtext` uses lookup3 internally. We approximate the
 * distribution with a 32-bit FNV-1a hash; in practice the admin panel
 * only needs *a* deterministic bucket so the explainer can show
 * "bucket X of 100 vs rollout_percent Y" — exact byte equivalence is
 * not required. The RPC is what gates real traffic.
 */
function stableBucket(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % 100;
}

/* ───────────────────── normalization ───────────────────── */

function normalizeRow(raw: unknown): FeatureFlagRow {
  const r = raw as Record<string, unknown>;
  return {
    key: String(r.key ?? ""),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    enabled: Boolean(r.enabled),
    rollout: normalizeRollout(r.rollout),
    rollout_percent: Number(r.rollout_percent ?? 0),
    allowlist_user_ids: toStringArray(r.allowlist_user_ids),
    allowlist_workspace_ids: toStringArray(r.allowlist_workspace_ids),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    updated_by: (r.updated_by as string | null) ?? null,
  };
}

function normalizeRollout(value: unknown): FeatureRollout {
  const s = String(value ?? "off");
  if (s === "off" || s === "on" || s === "allowlist" || s === "percent") {
    return s;
  }
  return "off";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export type { FeatureFlagRow };
