import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/* Server-side helpers for keeping search_documents in sync.
 *
 * Every feature that owns a searchable entity (tasks, CRM contacts,
 * files, shares, …) is expected to call these helpers from its own
 * server actions:
 *
 *   await indexDocument({
 *     workspaceId,
 *     entityType: 'task',
 *     entityId:   task.id,
 *     title:      task.title,
 *     subtitle:   `Due ${task.due_at} · ${task.assignee_name}`,
 *     body:       task.description,
 *     href:       `/tasks/${task.id}`,
 *     icon:       'check-square',
 *   });
 *
 * And on delete:
 *
 *   await unindexDocument({ entityType: 'task', entityId: task.id });
 *
 * The helpers use the service-role admin client because the underlying
 * RPCs are SECURITY DEFINER and not exposed to authenticated. Errors
 * are swallowed-but-logged so a failed index write never bricks the
 * source operation — search staying consistent is best-effort.
 */

export interface IndexDocumentInput {
  workspaceId: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  href: string;
  icon?: string | null;
}

export async function indexDocument(
  input: IndexDocumentInput
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("search_doc_upsert", {
    p_workspace_id: input.workspaceId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_title: input.title,
    p_subtitle: input.subtitle ?? null,
    p_body: input.body ?? null,
    p_href: input.href,
    p_icon: input.icon ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[search] indexDocument failed:", error.message, {
      entityType: input.entityType,
      entityId: input.entityId,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export interface UnindexDocumentInput {
  entityType: string;
  entityId: string;
}

export async function unindexDocument(
  input: UnindexDocumentInput
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("search_doc_remove", {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[search] unindexDocument failed:", error.message, input);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Bulk reindex — useful for backfill scripts after a schema change.
 *  Each item is applied independently; failures are returned per-item. */
export async function bulkIndex(
  items: IndexDocumentInput[]
): Promise<{ ok: number; failures: Array<{ entityId: string; error: string }> }> {
  let ok = 0;
  const failures: Array<{ entityId: string; error: string }> = [];
  for (const item of items) {
    const res = await indexDocument(item);
    if (res.ok) ok += 1;
    else failures.push({ entityId: item.entityId, error: res.error ?? "unknown" });
  }
  return { ok, failures };
}
