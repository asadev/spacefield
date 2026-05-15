import "server-only";

/* lib/collab/notifications.ts — server-side notification helpers.
 *
 * Notifications use the table from
 * `supabase/migrations/20260514c_collab_primitives.sql`.
 *
 * Auth model:
 *   - SELECT: RLS allows users to read their own notifications only.
 *   - UPDATE: RLS allows users to update their own notifications
 *     (used for mark-read / archive).
 *   - INSERT: denied to `authenticated` by policy omission. We insert
 *     via the service-role admin client.
 *
 * The mark-read helpers wrap the security-definer RPCs already in the
 * migration so they centralise the "must be the recipient" check.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface Notification {
  id: string;
  recipient_user_id: string;
  workspace_id: string | null;
  kind: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  actor_user_id: string | null;
  title: string;
  body: string | null;
  href: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export async function createNotification(opts: {
  recipientUserId: string;
  workspaceId?: string | null;
  kind: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actorUserId?: string | null;
  title: string;
  body?: string | null;
  href?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    recipient_user_id: opts.recipientUserId,
    workspace_id: opts.workspaceId ?? null,
    kind: opts.kind,
    source_entity_type: opts.sourceEntityType ?? null,
    source_entity_id: opts.sourceEntityId ?? null,
    actor_user_id: opts.actorUserId ?? null,
    title: opts.title,
    body: opts.body ?? null,
    href: opts.href ?? null,
    payload: opts.payload ?? {},
  });
  if (error) throw new Error(error.message);
}

/** List the current user's notifications. Uses the user-scoped client
 *  so RLS enforces recipient_user_id = auth.uid(). */
export async function listForUser(
  userId: string,
  opts?: {
    unreadOnly?: boolean;
    kind?: string;
    /** Filter to anything *except* archived. Default true. */
    includeArchived?: boolean;
    limit?: number;
  }
): Promise<Notification[]> {
  const supabase = await createClient();
  let q = supabase
    .from("notifications")
    .select(
      "id, recipient_user_id, workspace_id, kind, source_entity_type, source_entity_id, actor_user_id, title, body, href, payload, read_at, archived_at, created_at"
    )
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(opts?.limit ?? 50, 200)));
  if (opts?.unreadOnly) q = q.is("read_at", null);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  if (!opts?.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Notification[];
}

/** Count current user's unread notifications. Cheap because of the
 *  `notifications_recipient_unread_idx` partial index. */
export async function countUnread(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .is("read_at", null)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markRead(
  notificationId: string,
  _userId: string
): Promise<void> {
  // We call the security-definer RPC which already gates on
  // recipient_user_id = auth.uid(); the userId param is unused but
  // kept for callers that want to assert against it before calling.
  void _userId;
  const supabase = await createClient();
  const { error } = await supabase.rpc("notification_mark_read", {
    p_id: notificationId,
  });
  if (error) throw new Error(error.message);
}

export async function markAllRead(
  _userId: string,
  kind?: string
): Promise<number> {
  void _userId;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notification_mark_all_read", {
    p_kind: kind ?? null,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

/** Archive a notification (soft-removes it from the inbox). RLS already
 *  restricts updates to recipient = auth.uid(). */
export async function archiveNotification(
  notificationId: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw new Error(error.message);
}

/** Map notification `kind` to the inbox tab it belongs to. Centralised
 *  so the inbox UI and AI tools stay consistent. */
export function kindToTab(kind: string): "mentions" | "assignments" | "system" {
  if (kind.startsWith("comment.")) return "mentions";
  if (kind.startsWith("task.") || kind.includes("assigned")) {
    return "assignments";
  }
  return "system";
}
