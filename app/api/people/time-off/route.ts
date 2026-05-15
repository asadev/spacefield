import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  decideTimeOffRequest,
  submitTimeOffRequest,
} from "@/lib/people/actions";
import {
  getActiveWorkspaceId,
  getEmployeeForCallerInWorkspace,
  listMyTimeOffRequests,
} from "@/lib/people/server";

/**
 * GET /api/people/time-off
 *   ?employee_id=… → list requests for that employee (RLS-gated)
 *   (no filter)   → list the caller's own requests in active workspace
 *
 * POST /api/people/time-off  → submit a request
 *   body: { policy_id, start_date, end_date, reason? }
 *
 * PATCH /api/people/time-off → decide a request (approve/deny/cancel)
 *   body: { request_id, decision, notes? }
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const workspace_id =
    url.searchParams.get("workspace_id") ?? (await getActiveWorkspaceId());
  if (!workspace_id) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  let employee_id = url.searchParams.get("employee_id");
  if (!employee_id) {
    const me = await getEmployeeForCallerInWorkspace(workspace_id);
    employee_id = me?.id ?? null;
  }
  if (!employee_id) return NextResponse.json({ rows: [] });

  const rows = await listMyTimeOffRequests(workspace_id, employee_id);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { policy_id, start_date, end_date, reason } = body as {
    policy_id?: string;
    start_date?: string;
    end_date?: string;
    reason?: string;
  };
  if (!policy_id || !start_date || !end_date) {
    return NextResponse.json(
      { error: "policy_id, start_date, end_date required" },
      { status: 400 }
    );
  }
  const res = await submitTimeOffRequest({
    policy_id,
    start_date,
    end_date,
    reason,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ request: res.data });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { request_id, decision, notes } = body as {
    request_id?: string;
    decision?: "approved" | "denied" | "cancelled";
    notes?: string;
  };
  if (!request_id || !decision) {
    return NextResponse.json(
      { error: "request_id and decision required" },
      { status: 400 }
    );
  }
  const res = await decideTimeOffRequest({ request_id, decision, notes });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
