import "server-only";

import { createClient } from "@/lib/supabase/server";

/* lib/lifecycle — small server-side helpers shared between the
 * /account and /workspace/settings pages and the two cron routes.
 *
 * Migration 20260517a defines:
 *   - account_deletion_requests   (per-user queue row)
 *   - workspace_deletion_requests (per-workspace queue row)
 *
 * Both have requested_at / grace_until / cancelled_at. A row counts as
 * "pending" when cancelled_at is null and grace_until is in the future.
 * If grace_until is in the past, the cron will hard-delete on its next
 * pass.
 */

export type AccountDeletionRequest = {
  user_id: string;
  requested_at: string;
  grace_until: string;
  cancelled_at: string | null;
  reason: string | null;
  ip_hash: string | null;
};

export type WorkspaceDeletionRequest = {
  workspace_id: string;
  requested_by: string;
  requested_at: string;
  grace_until: string;
  cancelled_at: string | null;
  reason: string | null;
};

/**
 * Returns the active (cancelled_at IS NULL) account deletion request
 * for the signed-in user, or null. RLS keeps the read scoped to
 * auth.uid() = user_id so we can't accidentally surface someone else's
 * row.
 */
export async function getActiveAccountDeletion(): Promise<AccountDeletionRequest | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select("user_id, requested_at, grace_until, cancelled_at, reason, ip_hash")
    .eq("user_id", userData.user.id)
    .is("cancelled_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as AccountDeletionRequest | null) ?? null;
}

/**
 * Same, but for a specific workspace. The select RLS policy is gated
 * on is_workspace_member, so any member can see whether deletion is
 * pending — that's intentional, members deserve a heads-up.
 */
export async function getActiveWorkspaceDeletion(
  workspaceId: string
): Promise<WorkspaceDeletionRequest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_deletion_requests")
    .select(
      "workspace_id, requested_by, requested_at, grace_until, cancelled_at, reason"
    )
    .eq("workspace_id", workspaceId)
    .is("cancelled_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as WorkspaceDeletionRequest | null) ?? null;
}

/** Days remaining between now and grace_until. Floored at 0. */
export function daysUntil(graceUntilIso: string): number {
  const ms = new Date(graceUntilIso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/**
 * SHA-256 of the request IP as a short hex prefix. Used to attach a
 * coarse caller hint to the deletion-request row for after-the-fact
 * abuse review (a privacy-friendlier alternative to storing the raw
 * IP). Returns null when no IP is available or hashing fails.
 *
 * Marked async because crypto.subtle.digest is async. Callers should
 * await it.
 */
export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  try {
    const enc = new TextEncoder().encode(ip);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, 16);
  } catch {
    return null;
  }
}
