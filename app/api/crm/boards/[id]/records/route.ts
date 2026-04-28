/* GET/POST /api/crm/boards/[id]/records
 *  GET — list records. Supports `view_id` to apply that view's
 *        filters/sort. Pagination via `limit`/`offset`.
 *  POST — create a record. `data` is the cell-value jsonb keyed by
 *         field_key.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../../_helpers";
import { recordCreate } from "../../_schemas";
import type {
  CrmBoardRecord,
  CrmBoardView,
  BoardViewConfig,
  BoardViewSort,
  BoardViewFilter,
} from "@/app/tools/crm/_boards/types";

// Apply a view's sort+filters to an in-flight Supabase select chain.
// Filters reference jsonb cells via the `data->>field` arrow operator.
// The chain's fluent type is parameterized by the underlying schema and
// not worth carrying through a generic; we rebind the chain via a
// minimal interface (returns itself for method chaining).
interface SbFilterChain {
  eq: (col: string, value: unknown) => SbFilterChain;
  neq: (col: string, value: unknown) => SbFilterChain;
  in: (col: string, values: readonly unknown[]) => SbFilterChain;
  ilike: (col: string, value: string) => SbFilterChain;
  is: (col: string, value: unknown) => SbFilterChain;
  not: (col: string, op: string, value: unknown) => SbFilterChain;
  gt: (col: string, value: unknown) => SbFilterChain;
  gte: (col: string, value: unknown) => SbFilterChain;
  lt: (col: string, value: unknown) => SbFilterChain;
  lte: (col: string, value: unknown) => SbFilterChain;
  order: (col: string, opts: { ascending: boolean }) => SbFilterChain;
}

function applyViewConfig(
  query: SbFilterChain,
  cfg: BoardViewConfig
): SbFilterChain {
  let q = query;
  if (cfg.filters && cfg.filters.length > 0) {
    for (const f of cfg.filters as BoardViewFilter[]) {
      const ref = `data->>${f.field}`;
      switch (f.op) {
        case "eq":
          q = q.eq(ref, String(f.value));
          break;
        case "neq":
          q = q.neq(ref, String(f.value));
          break;
        case "in":
          if (Array.isArray(f.value)) {
            q = q.in(ref, f.value.map((v) => String(v)));
          }
          break;
        case "contains":
          q = q.ilike(ref, `%${String(f.value)}%`);
          break;
        case "starts_with":
          q = q.ilike(ref, `${String(f.value)}%`);
          break;
        case "ends_with":
          q = q.ilike(ref, `%${String(f.value)}`);
          break;
        case "is_empty":
          q = q.is(ref, null);
          break;
        case "is_not_empty":
          q = q.not(ref, "is", null);
          break;
        case "gt":
          q = q.gt(ref, String(f.value));
          break;
        case "gte":
          q = q.gte(ref, String(f.value));
          break;
        case "lt":
          q = q.lt(ref, String(f.value));
          break;
        case "lte":
          q = q.lte(ref, String(f.value));
          break;
        default:
          break;
      }
    }
  }
  if (cfg.sort && cfg.sort.length > 0) {
    for (const s of cfg.sort as BoardViewSort[]) {
      // sort by jsonb arrow operator; falls back to "position" if column
      // is the special "position".
      const ref = s.field === "position" ? "position" : `data->>${s.field}`;
      q = q.order(ref, { ascending: s.direction === "asc" });
    }
  }
  return q;
}

// ── GET ────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? "200"), 1000);
  const offset = Math.max(Number(sp.get("offset") ?? "0"), 0);
  const viewId = sp.get("view_id");

  let query = auth.supabase
    .from("crm_board_records")
    .select("*")
    .eq("board_id", id);

  if (viewId) {
    const { data: viewRow, error: viewErr } = await auth.supabase
      .from("crm_board_views")
      .select("*")
      .eq("id", viewId)
      .eq("board_id", id)
      .maybeSingle();
    if (viewErr) return jsonError(viewErr.message, 500);
    if (viewRow) {
      const v = viewRow as CrmBoardView;
      query = applyViewConfig(
        query as unknown as SbFilterChain,
        v.config ?? {}
      ) as unknown as typeof query;
    }
  }

  const { data, error } = await query
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({
    items: (data ?? []) as CrmBoardRecord[],
    limit,
    offset,
  });
}

// ── POST ───────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = recordCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  let position = parsed.data.position;
  if (position === undefined) {
    const { data: posRows } = await auth.supabase
      .from("crm_board_records")
      .select("position")
      .eq("board_id", id)
      .order("position", { ascending: false })
      .limit(1);
    position = posRows && posRows.length > 0
      ? (posRows[0].position as number) + 1
      : 0;
  }

  const { data, error } = await auth.supabase
    .from("crm_board_records")
    .insert({
      board_id: id,
      data: parsed.data.data ?? {},
      position,
      parent_id: parsed.data.parent_id ?? null,
      assignee_ids: parsed.data.assignee_ids ?? [],
      created_by: auth.user.id,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ record: data as CrmBoardRecord });
}
