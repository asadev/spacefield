import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  SavedView,
  SavedViewColumn,
  SavedViewFilter,
  SavedViewPatch,
  SavedViewScope,
  SavedViewSort,
} from "./types";

/* Saved-view server helpers.
 *
 * All four helpers run against the user-scoped Supabase client so RLS
 * on `saved_views` (defined in 20260514c) enforces visibility:
 *   - SELECT: personal scope owned by caller, or workspace scope where
 *     caller is a workspace member.
 *   - INSERT/UPDATE/DELETE: caller must be owner_user_id.
 *
 * We accept loose input objects (`unknown`-ish) and coerce to typed
 * arrays for filter/sort/columns so callers can pass through JSON they
 * received from the client without manual marshalling.
 */

const SELECT =
  "id, workspace_id, owner_user_id, scope, target_entity_type, name, filter, sort, columns, group_by, is_default, created_at, updated_at";

function coerceFilter(v: unknown): SavedViewFilter {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as SavedViewFilter;
  }
  return {};
}

function coerceSort(v: unknown): SavedViewSort[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((entry): SavedViewSort[] => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as { field?: unknown; direction?: unknown };
    const field = typeof e.field === "string" ? e.field : null;
    const direction = e.direction === "desc" ? "desc" : "asc";
    if (!field) return [];
    return [{ field, direction }];
  });
}

function coerceColumns(v: unknown): SavedViewColumn[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((entry): SavedViewColumn[] => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as { key?: unknown; width?: unknown; visible?: unknown };
    const key = typeof e.key === "string" ? e.key : null;
    if (!key) return [];
    return [
      {
        key,
        width: typeof e.width === "number" ? e.width : undefined,
        visible:
          typeof e.visible === "boolean" ? e.visible : undefined,
      },
    ];
  });
}

interface DbRow {
  id: string;
  workspace_id: string | null;
  owner_user_id: string;
  scope: string;
  target_entity_type: string;
  name: string;
  filter: unknown;
  sort: unknown;
  columns: unknown;
  group_by: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

function rowToView(row: DbRow): SavedView {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    owner_user_id: row.owner_user_id,
    scope: row.scope === "workspace" ? "workspace" : "personal",
    target_entity_type: row.target_entity_type,
    name: row.name,
    filter: coerceFilter(row.filter),
    sort: coerceSort(row.sort),
    columns: coerceColumns(row.columns),
    group_by: row.group_by,
    is_default: row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ───────────────────────────────────────────────────────────────────

export interface ListViewsForArgs {
  userId: string;
  workspaceId?: string | null;
  targetEntityType: string;
}

/** Return every saved view visible to the caller for an entity type.
 *  Personal views first (caller's), then workspace-scoped (when a
 *  workspaceId is supplied), then alphabetical within each group. */
export async function listViewsFor(
  args: ListViewsForArgs
): Promise<SavedView[]> {
  const supabase = await createClient();
  let query = supabase
    .from("saved_views")
    .select(SELECT)
    .eq("target_entity_type", args.targetEntityType);

  // Visibility is enforced by RLS — we still constrain the query so we
  // don't pull every workspace-scope view the user could theoretically
  // see across all their workspaces.
  if (args.workspaceId) {
    // Either personal (owner-scoped by RLS already) OR workspace match.
    query = query.or(
      `scope.eq.personal,and(scope.eq.workspace,workspace_id.eq.${args.workspaceId})`
    );
  } else {
    query = query.eq("scope", "personal");
  }

  const { data, error } = await query.order("name", { ascending: true });
  if (error) {
    throw new Error(`listViewsFor: ${error.message}`);
  }

  const rows = ((data ?? []) as DbRow[]).map(rowToView);
  rows.sort((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === "personal" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return rows;
}

// ───────────────────────────────────────────────────────────────────

export interface CreateViewArgs {
  ownerUserId: string;
  workspaceId?: string | null;
  scope: SavedViewScope;
  targetEntityType: string;
  name: string;
  filter?: SavedViewFilter;
  sort?: SavedViewSort[];
  columns?: SavedViewColumn[];
  groupBy?: string | null;
  isDefault?: boolean;
}

export async function createView(args: CreateViewArgs): Promise<SavedView> {
  if (!args.name?.trim()) {
    throw new Error("createView: name is required");
  }
  if (args.scope === "workspace" && !args.workspaceId) {
    throw new Error(
      "createView: workspaceId required for workspace-scope views"
    );
  }

  const supabase = await createClient();
  const insertRow = {
    owner_user_id: args.ownerUserId,
    workspace_id: args.workspaceId ?? null,
    scope: args.scope,
    target_entity_type: args.targetEntityType,
    name: args.name.trim(),
    filter: args.filter ?? {},
    sort: args.sort ?? [],
    columns: args.columns ?? [],
    group_by: args.groupBy ?? null,
    is_default: args.isDefault ?? false,
  };

  const { data, error } = await supabase
    .from("saved_views")
    .insert(insertRow)
    .select(SELECT)
    .single();
  if (error || !data) {
    throw new Error(`createView: ${error?.message ?? "no row returned"}`);
  }
  return rowToView(data as DbRow);
}

// ───────────────────────────────────────────────────────────────────

export interface UpdateViewArgs extends SavedViewPatch {
  id: string;
  ownerUserId: string;
}

export async function updateView(args: UpdateViewArgs): Promise<SavedView> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (args.name !== undefined) patch.name = args.name.trim();
  if (args.scope !== undefined) patch.scope = args.scope;
  if (args.filter !== undefined) patch.filter = args.filter;
  if (args.sort !== undefined) patch.sort = args.sort;
  if (args.columns !== undefined) patch.columns = args.columns;
  if (args.group_by !== undefined) patch.group_by = args.group_by;
  if (args.is_default !== undefined) patch.is_default = args.is_default;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_views")
    .update(patch)
    .eq("id", args.id)
    .eq("owner_user_id", args.ownerUserId)
    .select(SELECT)
    .single();
  if (error || !data) {
    throw new Error(`updateView: ${error?.message ?? "not found"}`);
  }
  return rowToView(data as DbRow);
}

// ───────────────────────────────────────────────────────────────────

export interface DeleteViewArgs {
  id: string;
  ownerUserId: string;
}

export async function deleteView(args: DeleteViewArgs): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_views")
    .delete()
    .eq("id", args.id)
    .eq("owner_user_id", args.ownerUserId);
  if (error) {
    throw new Error(`deleteView: ${error.message}`);
  }
}

// ───────────────────────────────────────────────────────────────────

/** Fetch a single view by id; returns null if not visible/found. */
export async function getView(id: string): Promise<SavedView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_views")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`getView: ${error.message}`);
  }
  if (!data) return null;
  return rowToView(data as DbRow);
}
