"use client";

/**
 * Client-side helpers for the server-side `recent_items` table.
 *
 * Two surfaces:
 *   - `recordView(type, id, workspaceId?)` — call after the user opens
 *     a page that represents an entity (a CRM contact, a task, a file,
 *     etc.). Best-effort fire-and-forget; failures are swallowed.
 *   - `listRecent(limit?)` — fetch the N most recently viewed entities
 *     for the current user. Returns `null` when Supabase isn't
 *     configured or the RPC is missing (e.g. on a build before the
 *     migration has been applied) so callers can gracefully fall back
 *     to localStorage.
 *
 * We keep the API tiny so the Cmd-K palette can swap recents without a
 * round of refactoring.
 */

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

export interface RecentItemRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  entity_type: string;
  entity_id: string;
  viewed_at: string;
}

/**
 * Record an entity view. Fire-and-forget; the promise resolves once the
 * RPC settles but callers should not await it on hot paths.
 *
 * Safe to call on every page load — the underlying SQL uses ON CONFLICT
 * + an LRU-style trim so we never blow past 50 rows per user.
 */
export async function recordView(
  entityType: string,
  entityId: string,
  workspaceId: string | null = null
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!entityType || !entityId) return;
  try {
    const sb = getSupabase();
    const { data } = await sb.auth.getUser();
    if (!data.user) return; // anonymous — nothing to record
    await sb.rpc("record_view", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_workspace_id: workspaceId,
    });
  } catch {
    // best-effort
  }
}

/**
 * List the N most recently viewed entities for the current user.
 * Returns null when Supabase is unavailable or the RPC errors so the
 * caller can fall back to a local cache.
 */
export async function listRecent(
  limit: number = 20
): Promise<RecentItemRow[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await sb.rpc("list_recent", {
      p_limit: Math.max(1, Math.min(limit, 100)),
    });
    if (error) return null;
    if (!Array.isArray(data)) return [];
    return data as RecentItemRow[];
  } catch {
    return null;
  }
}
