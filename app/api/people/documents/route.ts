import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  listEmployeeDocuments,
  listExpiringDocs,
} from "@/lib/people/server";
import {
  createEmployeeDocument,
  deleteEmployeeDocument,
} from "@/lib/people/actions";

/**
 * GET /api/people/documents
 *   ?employee_id=… → docs for that employee
 *   ?expiring_within=30 → workspace-wide expiry list
 *
 * POST /api/people/documents  → add a document
 *   body: { workspace_id, employee_id, kind, name, ... }
 *
 * DELETE /api/people/documents?id=…&employee_id=…
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const expiring = url.searchParams.get("expiring_within");
  if (expiring !== null) {
    const within = Math.min(Math.max(Number(expiring) || 30, 1), 365);
    const rows = await listExpiringDocs(within);
    return NextResponse.json({ rows });
  }
  const employee_id = url.searchParams.get("employee_id");
  if (!employee_id) {
    return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  }
  const rows = await listEmployeeDocuments(employee_id);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const {
    workspace_id,
    employee_id,
    kind,
    name,
    number,
    issued_at,
    expires_at,
    file_url,
    notes,
  } = body as Record<string, string | undefined>;
  if (!workspace_id || !employee_id || !kind || !name) {
    return NextResponse.json(
      { error: "workspace_id, employee_id, kind, name required" },
      { status: 400 }
    );
  }
  const res = await createEmployeeDocument({
    workspace_id,
    employee_id,
    kind: kind as
      | "emirates_id"
      | "visa"
      | "passport"
      | "contract"
      | "certification"
      | "other",
    name,
    number,
    issued_at,
    expires_at,
    file_url,
    notes,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const employee_id = url.searchParams.get("employee_id");
  if (!id || !employee_id) {
    return NextResponse.json(
      { error: "id and employee_id required" },
      { status: 400 }
    );
  }
  const res = await deleteEmployeeDocument(id, employee_id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
