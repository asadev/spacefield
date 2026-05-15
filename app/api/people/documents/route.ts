import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  listEmployeeDocuments,
  listExpiringDocs,
} from "@/lib/people/server";
import {
  createEmployeeDocument,
  deleteEmployeeDocument,
} from "@/lib/people/actions";

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .min(1)
  .max(40)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "invalid date",
  });

const DocCreateBody = z
  .object({
    workspace_id: uuid,
    employee_id: uuid,
    kind: z.enum([
      "emirates_id",
      "visa",
      "passport",
      "contract",
      "certification",
      "other",
    ]),
    name: z.string().min(1).max(200),
    number: z.string().max(120).optional(),
    issued_at: isoDate.optional(),
    expires_at: isoDate.optional(),
    file_url: z.string().url().max(2048).optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict();

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = DocCreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const res = await createEmployeeDocument(parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
