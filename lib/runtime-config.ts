import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type {
  RuntimeConfigRow,
  RuntimeConfigValueType,
} from "@/app/admin/_types";

/**
 * Runtime-config resolver. Server-only — call from server components,
 * server actions, or route handlers. The single source of truth is the
 * Postgres RPC `get_runtime_config` (defined in
 * supabase/migrations/20260509e_admin_panel_v6.sql), which already
 * masks `is_secret=true` values for non-admins.
 *
 * We keep a 30-second in-memory cache so hot-path callers (every
 * server-side render) don't round-trip to Postgres for the same key
 * repeatedly. Mutations through the admin actions invalidate via
 * `clearRuntimeConfigCache(key)` so changes are visible within a few
 * seconds even when the cache is warm.
 */

const CACHE_TTL_MS = 30_000;

type CacheEntry<T> = {
  value: T;
  expires: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

/** Drop a key from the in-memory cache. Called from server actions
 *  after a write so callers don't see stale values. */
export function clearRuntimeConfigCache(key?: string): void {
  if (!key) {
    cache.clear();
    return;
  }
  cache.delete(key);
}

/**
 * Resolve a runtime-config key. Returns the parsed value typed as `T`,
 * or the supplied `fallback` (or `undefined` if no fallback) when the
 * key is missing, the RPC errors, or the value can't be coerced.
 *
 * Values are cached for 30 seconds per process. To bust the cache for
 * a single key, call `clearRuntimeConfigCache(key)`.
 */
export async function getRuntimeConfig<T = unknown>(
  key: string,
  fallback?: T
): Promise<T> {
  if (!key) return fallback as T;

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) {
    return cached.value as T;
  }

  const value = await resolveFromRpc(key);
  if (value === undefined) {
    return fallback as T;
  }

  cache.set(key, { value, expires: now + CACHE_TTL_MS });
  return value as T;
}

/** Boolean specialisation. Coerces "truthy" inputs (true / "true" /
 *  "1" / 1) to `true`. Returns `fallback` on missing/error. */
export async function getRuntimeConfigBool(
  key: string,
  fallback = false
): Promise<boolean> {
  const v = await getRuntimeConfig<unknown>(key, undefined);
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const lower = v.trim().toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
  }
  return fallback;
}

/** Number specialisation. Returns `fallback` on missing/error. */
export async function getRuntimeConfigNumber(
  key: string,
  fallback = 0
): Promise<number> {
  const v = await getRuntimeConfig<unknown>(key, undefined);
  if (v === undefined || v === null) return fallback;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** String specialisation. JSON values are stringified. Returns
 *  `fallback` on missing/error. */
export async function getRuntimeConfigString(
  key: string,
  fallback = ""
): Promise<string> {
  const v = await getRuntimeConfig<unknown>(key, undefined);
  if (v === undefined || v === null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

/* ─────────────────────── helpers ─────────────────────── */

/**
 * Try the user-scoped client first so RLS lets the caller read
 * non-secret rows directly. Fall back to the service-role client when
 * the user client errors (e.g., during build, no cookie session).
 * Returns `undefined` when there's truly no value to be had — caller
 * should hand back the fallback.
 */
async function resolveFromRpc(key: string): Promise<unknown | undefined> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_runtime_config", {
      p_key: key,
    });
    if (!error && data !== null && data !== undefined) {
      return data;
    }
    if (!error) {
      return undefined;
    }
  } catch {
    // fall through to admin
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_runtime_config", {
      p_key: key,
    });
    if (error) return undefined;
    if (data === null || data === undefined) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

/**
 * Read every runtime-config row, ordered by category then key. Used by
 * the admin index page. Bypasses RLS via the service-role client so the
 * admin index can show `is_secret` rows (the page itself masks them).
 */
export async function listRuntimeConfig(): Promise<RuntimeConfigRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("runtime_config")
      .select(
        "key, value, value_type, description, category, is_secret, metadata, updated_at, updated_by"
      )
      .order("category", { ascending: true })
      .order("key", { ascending: true });
    if (error || !data) return [];
    return (data as unknown[]).map(normalizeRow);
  } catch {
    return [];
  }
}

/** Read a single runtime-config row, or `null`. Admin-only path. */
export async function getRuntimeConfigRow(
  key: string
): Promise<RuntimeConfigRow | null> {
  if (!key) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("runtime_config")
      .select(
        "key, value, value_type, description, category, is_secret, metadata, updated_at, updated_by"
      )
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return normalizeRow(data);
  } catch {
    return null;
  }
}

/** Coerce a value-type string into the discriminated union, defaulting
 *  to "string" on anything unknown. */
export function normalizeValueType(input: unknown): RuntimeConfigValueType {
  const allowed: RuntimeConfigValueType[] = [
    "string",
    "number",
    "boolean",
    "json",
    "secret",
  ];
  const s = String(input ?? "string").toLowerCase();
  return (allowed as string[]).includes(s)
    ? (s as RuntimeConfigValueType)
    : "string";
}

function normalizeRow(raw: unknown): RuntimeConfigRow {
  const r = raw as Partial<RuntimeConfigRow> & Record<string, unknown>;
  return {
    key: String(r.key ?? ""),
    value: r.value ?? null,
    value_type: normalizeValueType(r.value_type),
    description: String(r.description ?? ""),
    category: String(r.category ?? "general"),
    is_secret: Boolean(r.is_secret),
    metadata:
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {},
    updated_at: String(r.updated_at ?? ""),
    updated_by:
      typeof r.updated_by === "string" ? (r.updated_by as string) : null,
  };
}
