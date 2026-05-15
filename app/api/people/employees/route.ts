import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspaceId,
  listEmployees,
} from "@/lib/people/server";
import { createEmployee } from "@/lib/people/actions";

/**
 * GET /api/people/employees
 *
 * List employees in the calling user's active workspace. Honours the
 * same filters as the directory page: q, dept, status, manager_id, limit.
 *
 * Responses are gated by RLS on `employees`, which limits the rows to
 * the workspace the caller is a member of.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const workspace_id = url.searchParams.get("workspace_id") ?? (await getActiveWorkspaceId());
  if (!workspace_id) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const query = url.searchParams.get("q") ?? undefined;
  const department = url.searchParams.get("dept") ?? undefined;
  const status = (url.searchParams.get("status") ?? undefined) as
    | "active"
    | "on_leave"
    | "terminated"
    | undefined;
  const manager_id = url.searchParams.get("manager_id");
  const limit = Number(url.searchParams.get("limit") ?? 100);

  const rows = await listEmployees({
    workspaceId: workspace_id,
    query,
    department,
    status,
    manager_id: manager_id === null ? undefined : manager_id,
    limit,
  });

  return NextResponse.json({ rows });
}

/**
 * POST /api/people/employees
 *
 * Create an employee. Body: { workspace_id, full_name, ...optional }.
 * RLS gates the insert to workspace owners/admins.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const workspace_id = body.workspace_id as string | undefined;
  const full_name = body.full_name as string | undefined;
  if (!workspace_id || !full_name) {
    return NextResponse.json(
      { error: "workspace_id and full_name required" },
      { status: 400 }
    );
  }
  const res = await createEmployee({
    workspace_id,
    full_name,
    email: body.email as string | undefined,
    user_id: body.user_id as string | undefined,
    job_title: body.job_title as string | undefined,
    department: body.department as string | undefined,
    manager_id: (body.manager_id as string | null | undefined) ?? null,
    location: body.location as string | undefined,
    employment_type: body.employment_type as
      | "full_time"
      | "part_time"
      | "contractor"
      | "intern"
      | undefined,
    hire_date: body.hire_date as string | undefined,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ employee: res.data });
}
