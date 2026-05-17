import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Native-Postgres fulltext search on a single user-content table.
 *
 * Pairs with the `search_tsv` generated columns added in
 * 20260519c_fts_user_content.sql (tasks, projects, comments). The
 * column + GIN index live on the row itself — see the migration for
 * why this is separate from the cross-entity `search_documents`
 * mirror used by the command palette.
 *
 * Usage:
 *
 *   import { ftsQuery } from "@/lib/search/fulltext";
 *
 *   // Inside a server component / route handler:
 *   const rows = await ftsQuery("tasks", "invoice march", {
 *     workspaceId,
 *     select: "id, title, status, project_id",
 *     limit: 50,
 *   });
 *
 * Auth: uses the session-bound Supabase client by default so RLS on
 * the source table filters results to the caller's workspaces. If a
 * route already has a Supabase client it can pass it via `client` to
 * avoid re-resolving cookies.
 *
 * Empty / whitespace queries short-circuit to `[]` so callers don't
 * have to remember the guard.
 */

export type FtsTable = "tasks" | "projects" | "comments";

export interface FtsOptions {
  /** Workspace scope — strongly recommended even though RLS will gate
   *  cross-workspace reads, because the planner uses the equality to
   *  prune the partial GIN index. */
  workspaceId?: string;
  /** Column list to project. Defaults to `*`. Keep it tight on hot
   *  paths so we don't haul the whole row over the wire. */
  select?: string;
  /** Result cap. Clamped to [1, 200]. Defaults to 50. */
  limit?: number;
  /** Optional pre-built client (e.g. from a route handler that already
   *  resolved cookies). Defaults to a fresh session-bound client. */
  client?: SupabaseClient;
}

/** Result row — generic `Record<string, unknown>` because the select
 *  list is caller-controlled. Cast at the call site to your own row
 *  type for type safety. */
export type FtsRow = Record<string, unknown>;

/**
 * Run a websearch_to_tsquery-style fulltext match against the named
 * table's `search_tsv` column.
 *
 * We use `websearch_to_tsquery` (not `plainto_tsquery`) so users get
 * Google-style operator support — quoted phrases, leading `-foo` for
 * negation, `or` between terms — without us having to teach the UI
 * about tsquery syntax. The `simple` dictionary matches what
 * search_documents uses so the two paths tokenise identically.
 */
export async function ftsQuery(
  table: FtsTable,
  rawQuery: string,
  opts: FtsOptions = {},
): Promise<FtsRow[]> {
  const q = (rawQuery ?? "").trim();
  if (!q) return [];

  const client = opts.client ?? (await createClient());
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const select = opts.select?.trim() || "*";

  // Build the query. We rely on PostgREST's textSearch operator which
  // emits `search_tsv @@ websearch_to_tsquery('simple', $1)` server-side.
  let builder = client
    .from(table)
    .select(select)
    .textSearch("search_tsv", q, { type: "websearch", config: "simple" })
    .limit(limit);

  // Tasks/projects/comments all have `deleted_at`; the GIN index is
  // partial on `deleted_at is null` so skip the soft-deleted rows to
  // get the index path. (RLS also excludes them but the planner won't
  // know that without the WHERE clause.)
  builder = builder.is("deleted_at", null);

  if (opts.workspaceId) {
    builder = builder.eq("workspace_id", opts.workspaceId);
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(`ftsQuery(${table}): ${error.message}`);
  }
  return (data ?? []) as unknown as FtsRow[];
}
