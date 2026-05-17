import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/tasks/server";
import { importContacts } from "@/lib/import/importers/contacts";
import { importLeads } from "@/lib/import/importers/leads";
import { importEmployees } from "@/lib/import/importers/employees";
import { importTasks } from "@/lib/import/importers/tasks";
import type { ImportResult, ImportRowInput } from "@/lib/import/importers/types";
import { isEntityKey } from "@/lib/import/schemas";

/**
 * POST /api/import/[entity]
 *
 * Body shape:
 *   {
 *     workspace_id?: string,   // falls back to caller's first workspace
 *     mapping: Record<string, string | null>,
 *     rows: Record<string, string>[]
 *   }
 *
 * Returns `{ imported, skipped, errors }` from the per-entity importer.
 * Rate-limited to 30 requests/min per user since each call can fan out
 * into thousands of inserts.
 */

interface Body {
  workspace_id?: string;
  mapping: Record<string, string | null>;
  rows: ImportRowInput[];
}

const MAX_ROWS_PER_REQUEST = 5000;

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ entity: string }> }
): Promise<Response> {
  const { entity } = await ctx.params;
  if (!isEntityKey(entity)) {
    return NextResponse.json({ error: "unknown_entity" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body?.mapping || typeof body.mapping !== "object") {
    return NextResponse.json({ error: "mapping_required" }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows_must_be_array" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json(
      { error: `too_many_rows: cap is ${MAX_ROWS_PER_REQUEST}` },
      { status: 413 }
    );
  }

  const workspaceId = await resolveWorkspaceId(body.workspace_id ?? null);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "no_workspace" },
      { status: 403 }
    );
  }

  let result: ImportResult;
  switch (entity) {
    case "contacts":
      result = await importContacts(workspaceId, userId, body.rows, body.mapping);
      break;
    case "leads":
      result = await importLeads(workspaceId, userId, body.rows, body.mapping);
      break;
    case "employees":
      result = await importEmployees(workspaceId, userId, body.rows, body.mapping);
      break;
    case "tasks":
      result = await importTasks(workspaceId, userId, body.rows, body.mapping);
      break;
    default:
      return NextResponse.json({ error: "unknown_entity" }, { status: 400 });
  }

  return NextResponse.json({ ...result, workspace_id: workspaceId });
}

export const POST = withApiHandler<{ params: Promise<{ entity: string }> }>(
  handler,
  {
    source: "import.entity",
    rateLimit: { count: 30, window_sec: 60 },
  }
);
