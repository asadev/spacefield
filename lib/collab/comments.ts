import "server-only";

/* lib/collab/comments.ts — server-side comment helpers.
 *
 * Talks to the `comments` table created in
 * `supabase/migrations/20260514c_collab_primitives.sql`.
 *
 * IMPORTANT: comments INSERT is RLS-gated to workspace members with
 * `author_user_id = auth.uid()`. We therefore prefer the user-scoped
 * server client (cookies-forwarded) so RLS does the auth check.
 *
 * Notifications and activity emissions go through the service-role
 * admin client because INSERT on `notifications` is service-role only
 * (see RLS policy in the migration), and `activity_emit` is a security-
 * definer RPC we want to call without the user having direct grants.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { indexDocument, unindexDocument } from "@/lib/search/indexer";

/**
 * Map a comment's parent entity to a user-facing href. Returns null
 * for entity types that aren't worth surfacing in /search results
 * (so the comment is simply skipped from the index — not indexed
 * with a bogus link).
 */
function commentParentHref(
  entityType: string,
  entityId: string
): string | null {
  switch (entityType) {
    case "task":
      return `/tasks/${entityId}`;
    case "project":
      return `/projects/${entityId}`;
    case "contact":
      return `/admin/users/${entityId}`;
    default:
      return null;
  }
}

export interface Comment {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  author_user_id: string;
  body: string;
  mentions: string[];
  parent_comment_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  /** Joined from `profiles` when available. */
  author?: {
    user_id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

/** Parse `@<uuid>` tokens out of a body string into a deduped list. UUID
 *  pattern is liberal — we accept the standard 8-4-4-4-12 hex shape with
 *  hyphens (case-insensitive) — and we never trust the body alone, the
 *  composer is expected to track mentions in state and pass them through
 *  to createComment. This is the fallback parser. */
const UUID_RE =
  /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(UUID_RE)) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

export async function listComments(opts: {
  entityType: string;
  entityId: string;
  /** workspaceId is accepted for symmetry with createComment, but the RLS
   *  policy already restricts visibility to workspace members of the
   *  comment's own workspace_id. We do not filter on it here. */
  workspaceId?: string;
}): Promise<Comment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, workspace_id, entity_type, entity_id, author_user_id, body, mentions, parent_comment_id, edited_at, deleted_at, created_at"
    )
    .eq("entity_type", opts.entityType)
    .eq("entity_id", opts.entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Comment[];
  if (rows.length === 0) return rows;

  const authorIds = Array.from(
    new Set(rows.map((r) => r.author_user_id).filter(Boolean))
  );
  if (authorIds.length === 0) return rows;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, username, avatar_url")
    .in("user_id", authorIds);
  const byId = new Map(
    ((profiles ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      username: string | null;
      avatar_url: string | null;
    }>).map((p) => [p.user_id, p])
  );
  return rows.map((r) => ({ ...r, author: byId.get(r.author_user_id) ?? null }));
}

export async function createComment(opts: {
  workspaceId: string;
  entityType: string;
  entityId: string;
  authorUserId: string;
  body: string;
  mentions: string[];
  parentCommentId?: string | null;
}): Promise<Comment> {
  const supabase = await createClient();

  // De-dupe and merge parsed mentions with explicit ones — the composer
  // tracks them in state, but if the body contains tokens we missed, we
  // should still fan them out.
  const allMentions = Array.from(
    new Set([...(opts.mentions ?? []), ...parseMentions(opts.body)])
  );

  const { data, error } = await supabase
    .from("comments")
    .insert({
      workspace_id: opts.workspaceId,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      author_user_id: opts.authorUserId,
      body: opts.body,
      mentions: allMentions,
      parent_comment_id: opts.parentCommentId ?? null,
    })
    .select(
      "id, workspace_id, entity_type, entity_id, author_user_id, body, mentions, parent_comment_id, edited_at, deleted_at, created_at"
    )
    .single();

  if (error) throw new Error(error.message);
  const row = data as Comment;

  // Fan-out: notify each unique mention (skip self-mentions), and emit
  // an activity. We do this via service-role so the notifications row
  // succeeds even though authenticated INSERT is denied by RLS.
  const admin = createAdminClient();
  const mentioned = allMentions.filter((u) => u && u !== opts.authorUserId);
  if (mentioned.length > 0) {
    const href = `/inbox?entity_type=${encodeURIComponent(
      opts.entityType
    )}&entity_id=${encodeURIComponent(opts.entityId)}#c-${row.id}`;
    const rows = mentioned.map((uid) => ({
      recipient_user_id: uid,
      workspace_id: opts.workspaceId,
      kind: "comment.mention",
      source_entity_type: opts.entityType,
      source_entity_id: opts.entityId,
      actor_user_id: opts.authorUserId,
      title: "You were mentioned in a comment",
      body: row.body.slice(0, 240),
      href,
      payload: { comment_id: row.id },
    }));
    const { error: notifErr } = await admin.from("notifications").insert(rows);
    if (notifErr) {
      // eslint-disable-next-line no-console
      console.error("[collab.comments] notification fan-out failed:", notifErr.message);
    }
  }

  // Activity emit — wrap the RPC. Failure here is non-fatal.
  try {
    await admin.rpc("activity_emit", {
      p_workspace_id: opts.workspaceId,
      p_actor_user_id: opts.authorUserId,
      p_verb: "commented",
      p_entity_type: opts.entityType,
      p_entity_id: opts.entityId,
      p_payload: { comment_id: row.id, preview: row.body.slice(0, 120) },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[collab.comments] activity_emit failed:", err);
  }

  // Index into search_documents. We surface the comment under the
  // PARENT entity's URL so clicking the result lands the user where
  // they can actually read context. Parents we can't map (eg. some
  // niche entity_type) are simply not indexed — better than a dead
  // link. Errors are swallowed so a failing search write never bricks
  // commenting.
  try {
    const href = commentParentHref(row.entity_type, row.entity_id);
    if (href) {
      await indexDocument({
        workspaceId: row.workspace_id,
        entityType: "comment",
        entityId: row.id,
        title: row.body.slice(0, 120) || "(comment)",
        subtitle: `comment on ${row.entity_type}`,
        body: row.body,
        href,
        icon: "message-square",
      });
    }
  } catch (err) {
    log.warn("search.index.comment_failed", {
      comment_id: row.id,
      error: (err as Error)?.message ?? String(err),
    });
  }

  return row;
}

export async function softDeleteComment(
  commentId: string,
  byUserId: string
): Promise<void> {
  const supabase = await createClient();
  // RLS policy allows update only by the author — we add an explicit
  // author check for defence-in-depth.
  const { error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("author_user_id", byUserId);
  if (error) throw new Error(error.message);

  try {
    await unindexDocument({ entityType: "comment", entityId: commentId });
  } catch (err) {
    log.warn("search.unindex.comment_failed", {
      comment_id: commentId,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

export async function updateCommentBody(opts: {
  commentId: string;
  byUserId: string;
  body: string;
  mentions: string[];
}): Promise<Comment> {
  const supabase = await createClient();
  const allMentions = Array.from(
    new Set([...(opts.mentions ?? []), ...parseMentions(opts.body)])
  );
  const { data, error } = await supabase
    .from("comments")
    .update({
      body: opts.body,
      mentions: allMentions,
      edited_at: new Date().toISOString(),
    })
    .eq("id", opts.commentId)
    .eq("author_user_id", opts.byUserId)
    .select(
      "id, workspace_id, entity_type, entity_id, author_user_id, body, mentions, parent_comment_id, edited_at, deleted_at, created_at"
    )
    .single();
  if (error) throw new Error(error.message);
  const row = data as Comment;

  // Re-index so the search row reflects the edited body.
  try {
    const href = commentParentHref(row.entity_type, row.entity_id);
    if (href) {
      await indexDocument({
        workspaceId: row.workspace_id,
        entityType: "comment",
        entityId: row.id,
        title: row.body.slice(0, 120) || "(comment)",
        subtitle: `comment on ${row.entity_type}`,
        body: row.body,
        href,
        icon: "message-square",
      });
    }
  } catch (err) {
    log.warn("search.reindex.comment_failed", {
      comment_id: row.id,
      error: (err as Error)?.message ?? String(err),
    });
  }

  return row;
}
