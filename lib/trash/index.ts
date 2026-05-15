import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Universal recycle bin. Walks a known list of soft-delete-capable
 * tables and returns rows whose `deleted_at is not null` for the
 * current workspace.
 *
 * Defensive: a `try/catch` per table swallows missing-table or
 * column-not-found errors so the trash listing keeps working even when
 * a parallel migration hasn't landed yet. Each entry in TRASH_TABLES is
 * a single declarative shape — add a row to extend coverage.
 */

interface TrashTable {
  /** entity_type tag, snake_case singular. */
  entityType: string;
  /** Actual table name in Postgres. */
  table: string;
  /** Field used to resolve a human-readable label. */
  labelColumn: string;
  /** Optional secondary label column (concatenated when both present). */
  labelColumn2?: string;
  /** Optional FK column to auth.users we can show as "deleted by". */
  deletedByColumn?: string;
}

const TRASH_TABLES: TrashTable[] = [
  {
    entityType: "crm_contact",
    table: "crm_contacts",
    labelColumn: "first_name",
    labelColumn2: "last_name",
  },
  {
    entityType: "crm_lead",
    table: "crm_leads",
    labelColumn: "first_name",
    labelColumn2: "last_name",
  },
  { entityType: "crm_deal", table: "crm_deals", labelColumn: "title" },
  { entityType: "workspace_file", table: "workspace_files", labelColumn: "name" },
  {
    entityType: "comment",
    table: "comments",
    labelColumn: "body",
    deletedByColumn: "author_user_id",
  },
  // Speculative — these tables come from parallel agents. The try/catch
  // path below means listing keeps working if they're missing.
  { entityType: "task", table: "tasks", labelColumn: "title" },
  { entityType: "project", table: "projects", labelColumn: "name" },
  // NOTE: `employees` and `employee_documents` are intentionally NOT
  // included here. Those tables use `archived_at` (employees) / no
  // soft-delete column at all (employee_documents) per
  // supabase/migrations/20260514e_people.sql — not the `deleted_at`
  // column this trash UI keys on. Restoring an archived employee /
  // purging a document needs its own un-archive flow in /people admin;
  // that's out of scope for this universal recycle-bin module. The
  // earlier entries referenced non-existent columns (`name`, `title`)
  // and would have only ever produced 42703 errors swallowed by the
  // try/catch below anyway.
];

export interface TrashRow {
  entity_type: string;
  entity_id: string;
  label: string;
  workspace_id: string;
  deleted_at: string;
  deleted_by: string | null;
}

export async function listTrash(input: {
  workspaceId: string;
  entityType?: string | null;
}): Promise<TrashRow[]> {
  const workspaceId = input.workspaceId;
  if (!workspaceId) return [];
  const supabase = await createClient();

  const tablesToQuery = input.entityType
    ? TRASH_TABLES.filter((t) => t.entityType === input.entityType)
    : TRASH_TABLES;

  const results: TrashRow[] = [];
  for (const t of tablesToQuery) {
    try {
      const columns = [
        "id",
        "workspace_id",
        "deleted_at",
        t.labelColumn,
        t.labelColumn2,
        t.deletedByColumn,
      ]
        .filter((c): c is string => Boolean(c))
        .join(", ");

      const { data, error } = await supabase
        .from(t.table)
        .select(columns)
        .eq("workspace_id", workspaceId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(200);

      if (error) {
        // 42703 (column does not exist) / 42P01 (table missing) → skip
        // this entity type silently; everything else is a no-op too
        // because we never want trash listing to 500.
        continue;
      }
      if (!data) continue;

      type Row = {
        id: string;
        workspace_id: string;
        deleted_at: string | null;
        [k: string]: unknown;
      };

      for (const r of data as unknown as Row[]) {
        if (!r.deleted_at) continue;
        const a = (r[t.labelColumn] as string | null) ?? "";
        const b = t.labelColumn2
          ? (r[t.labelColumn2] as string | null) ?? ""
          : "";
        const label = `${a} ${b}`.trim() || "(untitled)";
        results.push({
          entity_type: t.entityType,
          entity_id: r.id,
          label: label.slice(0, 120),
          workspace_id: r.workspace_id,
          deleted_at: r.deleted_at,
          deleted_by: t.deletedByColumn
            ? ((r[t.deletedByColumn] as string | null) ?? null)
            : null,
        });
      }
    } catch {
      // Missing table or other infra failure — silently omit so the
      // user still sees trash from the tables that DO exist.
      continue;
    }
  }

  results.sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
  return results;
}

/**
 * Resolve the entity_type → table mapping. Returns null if we don't
 * know that entity type.
 */
function lookupTable(entityType: string): TrashTable | null {
  return TRASH_TABLES.find((t) => t.entityType === entityType) ?? null;
}

export async function restoreEntity(input: {
  entityType: string;
  entityId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tbl = lookupTable(input.entityType);
  if (!tbl) return { ok: false, error: "unknown_entity_type" };
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from(tbl.table)
      .update({ deleted_at: null })
      .eq("id", input.entityId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function purgeEntity(input: {
  entityType: string;
  entityId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tbl = lookupTable(input.entityType);
  if (!tbl) return { ok: false, error: "unknown_entity_type" };
  const supabase = await createClient();
  try {
    // Hard-delete only rows that are already trashed; refuse to purge
    // anything still live. Belt-and-braces against the caller passing a
    // bad id.
    const { error } = await supabase
      .from(tbl.table)
      .delete()
      .eq("id", input.entityId)
      .not("deleted_at", "is", null);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function trashTableEntityTypes(): string[] {
  return TRASH_TABLES.map((t) => t.entityType);
}
