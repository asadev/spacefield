/* ─────────────────────────────────────────────────────────────────────────
 * /api/crm/boards
 *  GET  — list boards in a workspace (excludes archived).
 *  POST — create a board. If `template_id` is supplied, instantiate the
 *         template (columns + views + sample records). Otherwise creates
 *         a `kind=custom` board with one "name" text column and a default
 *         table view.
 *
 * RLS gates everything; this layer just shapes the request and runs the
 * multi-table inserts in the right order.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import { boardCreate } from "./_schemas";
import { getBoardTemplate } from "@/app/tools/crm/_boards/templates";
import type {
  BoardSummary,
  CrmBoard,
  CrmBoardColumn,
  CrmBoardRecord,
  CrmBoardView,
} from "@/app/tools/crm/_boards/types";

// ── helpers ─────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function ensureUniqueSlug(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
  desired: string
): Promise<string> {
  const base = slugify(desired) || "board";
  let candidate = base;
  let n = 1;
  // Loop until we find a free slug. Bounded; in practice 1-2 iterations.
  while (n < 50) {
    const { data, error } = await supabase
      .from("crm_boards")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

// ── GET ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const { data: boards, error } = await auth.supabase
    .from("crm_boards")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message, 500);

  const boardRows = (boards ?? []) as CrmBoard[];
  const ids = boardRows.map((b) => b.id);

  // Cheap per-board record-count via a single grouped query.
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: countRows, error: countErr } = await auth.supabase
      .from("crm_board_records")
      .select("board_id")
      .in("board_id", ids);
    if (countErr) return jsonError(countErr.message, 500);
    for (const row of (countRows ?? []) as { board_id: string }[]) {
      counts[row.board_id] = (counts[row.board_id] ?? 0) + 1;
    }
  }

  const items: BoardSummary[] = boardRows.map((b) => ({
    ...b,
    record_count: counts[b.id] ?? 0,
  }));
  return NextResponse.json({ items });
}

// ── POST ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = boardCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const member = await requireWorkspaceMember(
    auth.supabase,
    parsed.data.workspace_id
  );
  if (!member.ok) return member.response;

  const { workspace_id, template_id } = parsed.data;
  const tpl = template_id ? getBoardTemplate(template_id) : undefined;
  if (template_id && !tpl) {
    return jsonError(`unknown template: ${template_id}`, 400);
  }

  const baseName =
    parsed.data.name?.trim() || tpl?.name || "Untitled board";
  const baseSlugSeed = tpl?.slug || baseName;
  let slug: string;
  try {
    slug = await ensureUniqueSlug(auth.supabase, workspace_id, baseSlugSeed);
  } catch (e) {
    return jsonError(
      safeErrorMessage(e, {
        source: "crm.boards.create.slug",
        userId: auth.user.id,
        fallback: "slug_failed",
      }),
      500
    );
  }

  // Pick the next position so the new board lands at the bottom.
  const { data: posRows } = await auth.supabase
    .from("crm_boards")
    .select("position")
    .eq("workspace_id", workspace_id)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition =
    posRows && posRows.length > 0 ? (posRows[0].position as number) + 1 : 0;

  const description =
    parsed.data.description ??
    (tpl
      ? tpl.sampleRecords.length > 0
        ? `${tpl.description} (includes sample data)`
        : tpl.description
      : null);

  const insertBoard = {
    workspace_id,
    name: baseName,
    slug,
    kind: parsed.data.kind ?? tpl?.kind ?? "custom",
    description,
    icon: parsed.data.icon ?? tpl?.icon ?? null,
    color: parsed.data.color ?? tpl?.color ?? null,
    position: nextPosition,
    created_by: auth.user.id,
  };

  const { data: board, error: boardErr } = await auth.supabase
    .from("crm_boards")
    .insert(insertBoard)
    .select("*")
    .single();
  if (boardErr) return jsonError(boardErr.message, 500);
  const created = board as CrmBoard;

  // ── columns ────────────────────────────────────────────────────────
  const columnsToInsert =
    tpl?.columns ??
    [
      {
        field_key: "name",
        label: "Name",
        field_type: "text" as const,
        required: true,
        width: 240,
        position: 0,
      },
    ];
  const { data: columnRows, error: colErr } = await auth.supabase
    .from("crm_board_columns")
    .insert(
      columnsToInsert.map((c, i) => ({
        board_id: created.id,
        field_key: c.field_key,
        label: c.label,
        field_type: c.field_type,
        config: c.config ?? {},
        required: c.required ?? false,
        width: c.width ?? 180,
        position: c.position ?? i,
      }))
    )
    .select("*");
  if (colErr) return jsonError(colErr.message, 500);
  const columns = (columnRows ?? []) as CrmBoardColumn[];

  // ── views ──────────────────────────────────────────────────────────
  const viewsToInsert =
    tpl?.views ??
    [
      {
        name: "Main table",
        view_type: "table" as const,
        is_default: true,
        position: 0,
      },
    ];
  const { data: viewRows, error: viewErr } = await auth.supabase
    .from("crm_board_views")
    .insert(
      viewsToInsert.map((v, i) => ({
        board_id: created.id,
        name: v.name,
        view_type: v.view_type,
        config: v.config ?? {},
        is_default: v.is_default ?? false,
        position: v.position ?? i,
      }))
    )
    .select("*");
  if (viewErr) return jsonError(viewErr.message, 500);
  const views = (viewRows ?? []) as CrmBoardView[];

  // ── sample records ─────────────────────────────────────────────────
  let records: CrmBoardRecord[] = [];
  if (tpl && tpl.sampleRecords.length > 0) {
    const { data: recRows, error: recErr } = await auth.supabase
      .from("crm_board_records")
      .insert(
        tpl.sampleRecords.map((r, i) => ({
          board_id: created.id,
          data: r.data ?? {},
          position: r.position ?? i,
          parent_id: r.parent_id ?? null,
          assignee_ids: r.assignee_ids ?? [],
          created_by: auth.user.id,
        }))
      )
      .select("*");
    if (recErr) return jsonError(recErr.message, 500);
    records = (recRows ?? []) as CrmBoardRecord[];
  }

  return NextResponse.json({
    board: created,
    columns,
    views,
    records,
  });
}
