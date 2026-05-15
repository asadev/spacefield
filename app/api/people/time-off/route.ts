import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .min(1)
  .max(40)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "invalid date",
  });

const SubmitBody = z
  .object({
    policy_id: uuid,
    start_date: isoDate,
    end_date: isoDate,
    reason: z.string().max(2000).optional(),
  })
  .strict();

const DecideBody = z
  .object({
    request_id: uuid,
    decision: z.enum(["approved", "denied", "cancelled"]),
    notes: z.string().max(2000).optional(),
  })
  .strict();

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = SubmitBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const res = await submitTimeOffRequest(parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ request: res.data });
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = DecideBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const res = await decideTimeOffRequest(parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
