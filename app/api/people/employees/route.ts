import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspaceId,
  listEmployees,
} from "@/lib/people/server";
import { createEmployee } from "@/lib/people/actions";

const uuid = z.string().uuid();

/**
 * Zod body schema for POST /api/people/employees.
 *
 * Notably we DO NOT accept `user_id` here — that's a mass-assignment
 * vector. If a future caller needs to bind an auth user to an employee
 * row, that flows through a separate, admin-gated invite endpoint, not
 * this open creation path.
 */
const EmployeeCreateBody = z
  .object({
    workspace_id: uuid,
    full_name: z.string().min(1).max(200),
    email: z.string().email().max(320).optional(),
    job_title: z.string().max(200).optional(),
    department: z.string().max(120).optional(),
    manager_id: z.union([uuid, z.null()]).optional(),
    location: z.string().max(200).optional(),
    employment_type: z
      .enum(["full_time", "part_time", "contractor", "intern"])
      .optional(),
    hire_date: z.string().max(40).optional(),
  })
  .strict();

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
 * RLS gates the insert to workspace owners/admins; we additionally
 * require a signed-in caller at the route boundary so anon traffic is
 * rejected before it ever reaches the action.
 *
 * `user_id` is rejected explicitly (`.strict()`) — see schema comment.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = EmployeeCreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const res = await createEmployee({
    workspace_id: body.workspace_id,
    full_name: body.full_name,
    email: body.email,
    job_title: body.job_title,
    department: body.department,
    manager_id: body.manager_id ?? null,
    location: body.location,
    employment_type: body.employment_type,
    hire_date: body.hire_date,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ employee: res.data });
}
