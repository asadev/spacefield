import "server-only";

/* lib/collab/activity.ts — server-side activity feed helpers.
 *
 * Wraps the `activities` table + `activity_emit` RPC from
 * `supabase/migrations/20260514c_collab_primitives.sql`.
 *
 * Reads use the user-scoped client (RLS gates by workspace membership).
 * Writes go through the security-definer RPC via service-role so we
 * don't need to grant authenticated direct INSERT on the table.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface Activity {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  verb: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor?: {
    user_id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export async function logActivity(opts: {
  workspaceId: string;
  actorUserId?: string | null;
  verb: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("activity_emit", {
    p_workspace_id: opts.workspaceId,
    p_actor_user_id: opts.actorUserId ?? null,
    p_verb: opts.verb,
    p_entity_type: opts.entityType,
    p_entity_id: opts.entityId,
    p_payload: opts.payload ?? {},
  });
  if (error) throw new Error(error.message);
  return typeof data === "string" ? data : null;
}

export async function listActivities(opts: {
  workspaceId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  before?: Date;
}): Promise<Activity[]> {
  const supabase = await createClient();
  let q = supabase
    .from("activities")
    .select(
      "id, workspace_id, actor_user_id, verb, entity_type, entity_id, payload, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(opts.limit ?? 50, 200)));
  if (opts.workspaceId) q = q.eq("workspace_id", opts.workspaceId);
  if (opts.entityType) q = q.eq("entity_type", opts.entityType);
  if (opts.entityId) q = q.eq("entity_id", opts.entityId);
  if (opts.before) q = q.lt("created_at", opts.before.toISOString());

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Activity[];
  if (rows.length === 0) return rows;

  const actorIds = Array.from(
    new Set(
      rows.map((r) => r.actor_user_id).filter((u): u is string => Boolean(u))
    )
  );
  if (actorIds.length === 0) return rows;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, username, avatar_url")
    .in("user_id", actorIds);
  const byId = new Map(
    ((profiles ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      username: string | null;
      avatar_url: string | null;
    }>).map((p) => [p.user_id, p])
  );
  return rows.map((r) => ({
    ...r,
    actor: r.actor_user_id ? byId.get(r.actor_user_id) ?? null : null,
  }));
}

/** Format a verb + payload into a human sentence for the timeline. The
 *  formatter prefers explicit payload.label fields when present, falling
 *  back to a generic "<verb> <entity_type>" phrasing. */
export function formatActivityLine(row: Activity): string {
  const label =
    typeof row.payload?.label === "string"
      ? (row.payload.label as string)
      : null;
  switch (row.verb) {
    case "commented":
      return label
        ? `commented on ${row.entity_type}: ${label}`
        : `commented on a ${row.entity_type}`;
    case "created":
      return label
        ? `created ${row.entity_type}: ${label}`
        : `created a ${row.entity_type}`;
    case "updated":
      return label
        ? `updated ${row.entity_type}: ${label}`
        : `updated a ${row.entity_type}`;
    case "completed":
      return label
        ? `completed ${row.entity_type}: ${label}`
        : `completed a ${row.entity_type}`;
    case "assigned":
      return label
        ? `assigned ${row.entity_type}: ${label}`
        : `assigned a ${row.entity_type}`;
    default:
      return label
        ? `${row.verb} ${row.entity_type}: ${label}`
        : `${row.verb} a ${row.entity_type}`;
  }
}
