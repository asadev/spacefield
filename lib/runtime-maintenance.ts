import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MaintenanceStateRow } from "@/app/admin/_types";

/* In-memory TTL cache for maintenance state.
 *
 * Reads happen on every page render — caching for 30s reduces RPC pressure
 * during normal traffic and lets an admin-toggle take effect within ~30s
 * on every server instance. Each Node worker gets its own cache; we don't
 * synchronize between instances because eventual consistency is fine here. */

const TTL_MS = 30_000;

interface MaintenanceCacheEntry {
  active: boolean;
  message: string;
  read_only: boolean;
  starts_at: string | null;
  ends_at: string | null;
  fetchedAt: number;
}

const cache = new Map<string, MaintenanceCacheEntry>();

function cacheKey(uid?: string): string {
  return uid ?? "__anon__";
}

/* Pulls the singleton maintenance_state row + the maintenance_active(uid)
 * RPC result. Returns null when the underlying tables / RPCs are missing
 * (eg. local dev pointed at an unmigrated DB) so callers degrade
 * gracefully to "site is up". */
export async function getMaintenanceState(
  uid?: string,
): Promise<{
  active: boolean;
  message: string;
  read_only: boolean;
  starts_at: string | null;
  ends_at: string | null;
} | null> {
  const key = cacheKey(uid);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.fetchedAt < TTL_MS) {
    return {
      active: hit.active,
      message: hit.message,
      read_only: hit.read_only,
      starts_at: hit.starts_at,
      ends_at: hit.ends_at,
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }

  const [activeRes, rowRes] = await Promise.all([
    admin.rpc("maintenance_active", { uid: uid ?? null }),
    admin
      .from("maintenance_state")
      .select("*")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (activeRes.error || rowRes.error) {
    return null;
  }

  const row = (rowRes.data as MaintenanceStateRow | null) ?? null;
  const active = activeRes.data === true;
  const entry: MaintenanceCacheEntry = {
    active,
    message: row?.message ?? "We'll be back shortly.",
    read_only: row?.read_only ?? false,
    starts_at: row?.starts_at ?? null,
    ends_at: row?.ends_at ?? null,
    fetchedAt: now,
  };
  cache.set(key, entry);
  return {
    active: entry.active,
    message: entry.message,
    read_only: entry.read_only,
    starts_at: entry.starts_at,
    ends_at: entry.ends_at,
  };
}
