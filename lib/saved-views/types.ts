/* Saved views shared types.
 *
 * Backed by the `saved_views` table from 20260514c_collab_primitives.sql.
 * Schema (relevant columns):
 *   id, workspace_id, owner_user_id, scope, target_entity_type,
 *   name, filter (jsonb), sort (jsonb), columns (jsonb), group_by,
 *   is_default, created_at, updated_at.
 */

export type SavedViewScope = "personal" | "workspace";

/** Generic filter shape — each list page picks its own keys.
 *  We keep this as `Record<string, unknown>` rather than locking it
 *  down, because the same View infra serves Tasks, Contacts, Deals,
 *  Files, etc. and each has its own filter vocabulary. */
export type SavedViewFilter = Record<string, unknown>;

export interface SavedViewSort {
  /** Column key. */
  field: string;
  /** Direction. */
  direction: "asc" | "desc";
}

export interface SavedViewColumn {
  /** Column key — opaque per entity type. */
  key: string;
  /** Optional display width hint (px). */
  width?: number;
  /** Whether the column is visible. Defaults to true. */
  visible?: boolean;
}

export interface SavedView {
  id: string;
  workspace_id: string | null;
  owner_user_id: string;
  scope: SavedViewScope;
  target_entity_type: string;
  name: string;
  filter: SavedViewFilter;
  sort: SavedViewSort[];
  columns: SavedViewColumn[];
  group_by: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Input for createView/updateView. */
export interface SavedViewPatch {
  name?: string;
  scope?: SavedViewScope;
  filter?: SavedViewFilter;
  sort?: SavedViewSort[];
  columns?: SavedViewColumn[];
  group_by?: string | null;
  is_default?: boolean;
}
